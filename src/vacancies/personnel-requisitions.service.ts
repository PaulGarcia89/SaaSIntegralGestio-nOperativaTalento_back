import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PersonnelRequisitionApprovalStatus, PersonnelRequisitionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AccessScope } from '../common/enums/access-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CreatePersonnelRequisitionDto } from './dto/personnel-requisition.dto';

const requisitionInclude = {
  requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  locations: { include: { branch: true }, orderBy: { isPrimary: 'desc' as const } },
  approvals: {
    include: { approver: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  vacancies: { select: { id: true, title: true, status: true } },
};

@Injectable()
export class PersonnelRequisitionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, actor: JwtPayload, dto: CreatePersonnelRequisitionDto) {
    const branchIds = [...new Set(dto.branchIds)];
    const approverIds = [...new Set(dto.approverUserIds)];
    if (!branchIds.length) throw new BadRequestException('At least one location is required');
    if (dto.budgetMin != null && dto.budgetMax != null && dto.budgetMin > dto.budgetMax) {
      throw new BadRequestException('budgetMax must be greater than or equal to budgetMin');
    }
    await this.assertBranches(tenantId, actor, branchIds);
    await this.assertApprovers(tenantId, approverIds);
    const submitted = dto.status === PersonnelRequisitionStatus.PENDING_APPROVAL;
    if (submitted && !approverIds.length) throw new BadRequestException('At least one approver is required before submission');

    return this.prisma.$transaction(async (tx) => {
      const requisition = await tx.personnelRequisition.create({
        data: {
          tenantId,
          requestedByUserId: actor.sub,
          title: dto.title.trim(),
          department: dto.department?.trim(),
          justification: dto.justification.trim(),
          openings: dto.openings,
          budgetMin: dto.budgetMin,
          budgetMax: dto.budgetMax,
          currency: dto.currency.toUpperCase(),
          targetStartDate: dto.targetStartDate ? new Date(dto.targetStartDate) : undefined,
          status: submitted ? PersonnelRequisitionStatus.PENDING_APPROVAL : PersonnelRequisitionStatus.DRAFT,
          submittedAt: submitted ? new Date() : undefined,
        },
      });
      await tx.personnelRequisitionLocation.createMany({
        data: branchIds.map((branchId, index) => ({ tenantId, requisitionId: requisition.id, branchId, isPrimary: index === 0 })),
      });
      if (approverIds.length) {
        await tx.personnelRequisitionApproval.createMany({
          data: approverIds.map((approverUserId) => ({ tenantId, requisitionId: requisition.id, approverUserId })),
        });
      }
      return tx.personnelRequisition.findUniqueOrThrow({ where: { id: requisition.id }, include: requisitionInclude });
    });
  }

  async list(tenantId: string, actor: JwtPayload, status?: PersonnelRequisitionStatus) {
    const branchScope = actor.scope === AccessScope.BRANCH && !actor.isSuperAdmin
      ? { locations: { some: { branchId: { in: actor.allowedBranchIds } } } }
      : {};
    return this.prisma.personnelRequisition.findMany({
      where: { tenantId, ...branchScope, ...(status ? { status } : {}) },
      include: requisitionInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async decide(id: string, tenantId: string, actor: JwtPayload, approved: boolean, note?: string) {
    const requisition = await this.prisma.personnelRequisition.findFirst({ where: { id, tenantId }, include: { approvals: true } });
    if (!requisition) throw new NotFoundException('Personnel requisition not found');
    if (requisition.status !== PersonnelRequisitionStatus.PENDING_APPROVAL) throw new BadRequestException('Only pending requisitions can be decided');
    const assigned = requisition.approvals.find((item) => item.approverUserId === actor.sub);
    if (!assigned && !actor.isSuperAdmin) throw new ForbiddenException('You are not an assigned approver');
    if (!approved && !note?.trim()) throw new BadRequestException('A rejection reason is required');

    return this.prisma.$transaction(async (tx) => {
      if (assigned) {
        await tx.personnelRequisitionApproval.update({
          where: { id: assigned.id },
          data: {
            status: approved ? PersonnelRequisitionApprovalStatus.APPROVED : PersonnelRequisitionApprovalStatus.REJECTED,
            note: note?.trim(),
            decidedAt: new Date(),
            decidedByUserId: actor.sub,
          },
        });
      } else {
        await tx.personnelRequisitionApproval.create({
          data: {
            tenantId,
            requisitionId: id,
            approverUserId: actor.sub,
            decidedByUserId: actor.sub,
            status: approved ? PersonnelRequisitionApprovalStatus.APPROVED : PersonnelRequisitionApprovalStatus.REJECTED,
            note: note?.trim(),
            decidedAt: new Date(),
          },
        });
      }
      const approvals = await tx.personnelRequisitionApproval.findMany({ where: { requisitionId: id } });
      const rejected = approvals.some((item) => item.status === PersonnelRequisitionApprovalStatus.REJECTED);
      const complete = approvals.length > 0 && approvals.every((item) => item.status === PersonnelRequisitionApprovalStatus.APPROVED);
      const status = rejected ? PersonnelRequisitionStatus.REJECTED : complete ? PersonnelRequisitionStatus.APPROVED : PersonnelRequisitionStatus.PENDING_APPROVAL;
      await tx.personnelRequisition.update({
        where: { id },
        data: {
          status,
          decidedAt: status === PersonnelRequisitionStatus.PENDING_APPROVAL ? null : new Date(),
          rejectionReason: rejected ? note?.trim() : null,
        },
      });
      return tx.personnelRequisition.findUniqueOrThrow({ where: { id }, include: requisitionInclude });
    });
  }

  private async assertBranches(tenantId: string, actor: JwtPayload, branchIds: string[]) {
    const count = await this.prisma.branch.count({ where: { tenantId, id: { in: branchIds } } });
    if (count !== branchIds.length) throw new BadRequestException('Every location must belong to the active tenant');
    if (actor.scope === AccessScope.BRANCH && !actor.isSuperAdmin && branchIds.some((id) => !actor.allowedBranchIds.includes(id))) {
      throw new ForbiddenException('A location is outside the actor access scope');
    }
  }

  private async assertApprovers(tenantId: string, userIds: string[]) {
    if (!userIds.length) return;
    const count = await this.prisma.user.count({ where: { tenantId, id: { in: userIds }, status: 'ACTIVE' } });
    if (count !== userIds.length) throw new BadRequestException('Every approver must be an active tenant user');
  }
}
