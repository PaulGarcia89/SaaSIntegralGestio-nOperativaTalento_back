import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { ModuleCode } from '@prisma/client';
import { AccessScope } from '../common/enums/access-scope.enum';
import { RoleScope } from '../common/enums/role-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AvailabilityQueryDto, BookInterviewSlotDto, CreateInterviewSchedulingRequestDto } from './dto/recruitment.dto';
import { InterviewCalendarService } from './interview-calendar.service';
import { RecruitmentService } from './recruitment.service';

@Injectable()
export class InterviewSelfSchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recruitment: RecruitmentService,
    private readonly calendars: InterviewCalendarService,
    private readonly notifications: NotificationsService,
  ) {}

  async createRequest(tenantId: string, actor: JwtPayload, dto: CreateInterviewSchedulingRequestDto) {
    const application = await this.prisma.vacancyApplication.findFirst({
      where: { id: dto.applicationId, tenantId },
      include: { candidate: true, vacancy: true },
    });
    if (!application) throw new NotFoundException('Application not found');
    if (actor.scope === AccessScope.BRANCH && !actor.isSuperAdmin && !actor.allowedBranchIds.includes(application.vacancy.branchId)) {
      throw new NotFoundException('Application not found');
    }
    const windowStartsAt = this.date(dto.windowStartsAt, 'windowStartsAt');
    const windowEndsAt = this.date(dto.windowEndsAt, 'windowEndsAt');
    if (windowEndsAt <= windowStartsAt || windowEndsAt.getTime() - windowStartsAt.getTime() > 31 * 86_400_000) {
      throw new BadRequestException('Scheduling window must be positive and no longer than 31 days');
    }
    let interviewerIds = [...new Set(dto.interviewerUserIds ?? [])];
    if (dto.poolId) {
      const pool = await this.prisma.interviewPool.findFirst({
        where: { id: dto.poolId, tenantId, active: true, OR: [{ branchId: null }, { branchId: application.vacancy.branchId }] },
        include: { members: { where: { active: true }, orderBy: { priority: 'asc' }, take: 4 } },
      });
      if (!pool) throw new BadRequestException('Interview pool is not available');
      if (!interviewerIds.length) interviewerIds = pool.members.filter((item) => item.defaultRole !== 'SHADOW').map((item) => item.userId);
    }
    if (!interviewerIds.length) throw new BadRequestException('At least one interviewer or pool is required');
    const validUsers = await this.prisma.user.count({ where: { tenantId, id: { in: [...interviewerIds, ...(dto.shadowUserIds ?? [])] }, status: 'ACTIVE' } });
    if (validUsers !== new Set([...interviewerIds, ...(dto.shadowUserIds ?? [])]).size) throw new BadRequestException('Invalid interviewer selection');
    const resources = dto.resourceIds?.length ? await this.prisma.interviewResource.count({ where: { tenantId, branchId: application.vacancy.branchId, active: true, id: { in: dto.resourceIds } } }) : 0;
    if (dto.resourceIds?.length && resources !== new Set(dto.resourceIds).size) throw new BadRequestException('Invalid interview resource selection');

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Math.min(windowEndsAt.getTime(), Date.now() + (dto.expiresInDays ?? 14) * 86_400_000));
    const request = await this.prisma.interviewSchedulingRequest.create({
      data: { tenantId, applicationId: application.id, poolId: dto.poolId, createdByUserId: actor.sub, tokenHash: this.hash(token), title: dto.title.trim(), type: dto.type, timezone: dto.timezone, durationMinutes: dto.durationMinutes, windowStartsAt, windowEndsAt, requestedInterviewerIds: interviewerIds, shadowInterviewerIds: dto.shadowUserIds ?? [], resourceIds: dto.resourceIds ?? [], expiresAt },
    });
    const baseUrl = (process.env.CANDIDATE_PORTAL_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    const url = `${baseUrl}/candidate/interviews/schedule?token=${encodeURIComponent(token)}`;
    await this.notifications.createExternalEmail({ tenantId, recipientEmail: application.candidate.email, title: 'Elige el horario de tu entrevista', message: `Selecciona un horario disponible para ${dto.title}.`, actionUrl: url, correlationId: request.id, deduplicationKey: `interview-self-schedule:${request.id}` });
    return { ...request, url };
  }

  async publicContext(token: string) {
    const request = await this.requireOpen(token);
    const query: AvailabilityQueryDto = { startsAt: request.windowStartsAt.toISOString(), endsAt: request.windowEndsAt.toISOString(), durationMinutes: request.durationMinutes };
    const common = await this.calendars.getCommonAvailability(request.tenantId, [...request.requestedInterviewerIds, ...request.shadowInterviewerIds], query);
    const slots = [];
    for (const slot of common.slots) {
      const startsAt = new Date(slot.startsAt); const endsAt = new Date(slot.endsAt);
      const conflict = request.resourceIds.length ? await this.prisma.interviewResourceBooking.findFirst({ where: { tenantId: request.tenantId, resourceId: { in: request.resourceIds }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, interview: { status: { in: ['SCHEDULED', 'CONFIRMED'] } } } }) : null;
      if (!conflict) slots.push(slot);
    }
    return { title: request.title, type: request.type, timezone: request.timezone, durationMinutes: request.durationMinutes, expiresAt: request.expiresAt, candidate: { fullName: request.application.candidate.fullName }, vacancy: { title: request.application.vacancy.title }, slots: slots.slice(0, 100) };
  }

  async book(token: string, dto: BookInterviewSlotDto) {
    const request = await this.requireOpen(token);
    const context = await this.publicContext(token);
    const slot = context.slots.find((item) => item.startsAt === new Date(dto.startsAt).toISOString());
    if (!slot) throw new ConflictException('The selected slot is no longer available');
    const claimed = await this.prisma.interviewSchedulingRequest.updateMany({ where: { id: request.id, status: 'OPEN', expiresAt: { gt: new Date() } }, data: { status: 'BOOKED', bookedAt: new Date() } });
    if (!claimed.count) throw new ConflictException('This scheduling link was already used');
    try {
      const actor = this.systemActor(request);
      const interview = await this.recruitment.scheduleInterview(request.tenantId, actor, { applicationId: request.applicationId, interviewerUserId: request.requestedInterviewerIds[0], participantUserIds: request.requestedInterviewerIds.slice(1), shadowUserIds: request.shadowInterviewerIds, poolId: request.poolId ?? undefined, resourceIds: request.resourceIds, title: request.title, type: request.type, timezone: request.timezone, startsAt: slot.startsAt, endsAt: slot.endsAt });
      if (!interview) throw new Error('Interview was not created');
      await this.prisma.applicationInterview.update({ where: { id: interview.id }, data: { schedulingRequestId: request.id } });
      return { booked: true, interviewId: interview.id, startsAt: slot.startsAt, endsAt: slot.endsAt, timezone: request.timezone };
    } catch (error) {
      await this.prisma.interviewSchedulingRequest.updateMany({ where: { id: request.id, status: 'BOOKED' }, data: { status: 'OPEN', bookedAt: null } });
      throw error;
    }
  }

  private async requireOpen(token: string) {
    const request = await this.prisma.interviewSchedulingRequest.findUnique({ where: { tokenHash: this.hash(token) }, include: { application: { include: { candidate: true, vacancy: true } }, createdBy: true } });
    if (!request || request.status !== 'OPEN') throw new NotFoundException('Scheduling link is invalid or no longer available');
    if (request.expiresAt <= new Date()) {
      await this.prisma.interviewSchedulingRequest.update({ where: { id: request.id }, data: { status: 'EXPIRED' } });
      throw new NotFoundException('Scheduling link expired');
    }
    return request;
  }

  private systemActor(request: Awaited<ReturnType<InterviewSelfSchedulingService['requireOpen']>>): JwtPayload {
    return { sub: request.createdBy.id, userId: request.createdBy.id, tenantId: request.tenantId, allowedTenantIds: [request.tenantId], activeTenantId: request.tenantId, tenantSlug: '', tenantName: '', email: request.createdBy.email, firstName: request.createdBy.firstName, lastName: request.createdBy.lastName, role: 'RECRUITER', scope: AccessScope.TENANT, isSuperAdmin: false, roleScope: RoleScope.TENANT_ADMIN, allowedBranchIds: [], activeBranchId: request.createdBy.activeBranchId, roles: ['RECRUITER'], permissions: ['applications.update'], enabledModules: [ModuleCode.ATS], isGlobalContext: false, impersonation: { active: false, tenantId: null, startedAt: null, reason: null }, subscriptionStatus: 'ACTIVE', subscriptionGraceEndsAt: null } as JwtPayload;
  }

  private hash(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private date(value: string, field: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} must be a valid ISO date`); return date; }
}
