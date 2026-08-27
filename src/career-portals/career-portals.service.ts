import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CareerPortalAccess, CareerPortalType, JobPublicationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ListPublicVacanciesDto } from '../vacancies/dto/list-public-vacancies.dto';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';
import { UpdateCareerPortalsConfigDto, CareerPortalChannelConfigDto } from './dto/career-portals-config.dto';
import { createHash } from 'node:crypto';

@Injectable()
export class CareerPortalsService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(tenantId: string) {
    const [tenant, portals] = await this.prisma.$transaction([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, slug: true, name: true, marketplaceEnabled: true } }),
      this.prisma.careerPortal.findMany({ where: { tenantId, type: { in: [CareerPortalType.COMPANY_PORTAL, CareerPortalType.CAREER_SITE] } }, include: { branding: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    const companyPortal = portals.find((portal) => portal.type === CareerPortalType.COMPANY_PORTAL);
    const brandedCareerSite = portals.find((portal) => portal.type === CareerPortalType.CAREER_SITE);
    return {
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      marketplace: { enabled: tenant.marketplaceEnabled, slug: 'marketplace', type: CareerPortalType.MARKETPLACE },
      companyPortal: this.configChannel(companyPortal),
      brandedCareerSite: this.configChannel(brandedCareerSite),
    };
  }

  async updateConfig(tenantId: string, dto: UpdateCareerPortalsConfigDto) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, slug: true, name: true } });
    await this.prisma.$transaction(async (tx) => {
      if (dto.marketplaceEnabled !== undefined) {
        await tx.tenant.update({ where: { id: tenantId }, data: { marketplaceEnabled: dto.marketplaceEnabled } });
      }
      await this.saveChannel(tx, tenant, CareerPortalType.COMPANY_PORTAL, dto.companyPortal, 'Company career portal');
      await this.saveChannel(tx, tenant, CareerPortalType.CAREER_SITE, dto.brandedCareerSite, 'Branded career site');
    });
    return this.getConfig(tenantId);
  }

  async resolve(input: { host?: string; path?: string; slug?: string }) {
    const host = this.normalizeHost(input.host);
    const path = this.normalizePath(input.path);
    const hostLabel = host?.split('.')[0];
    const portal = await this.prisma.careerPortal.findFirst({
      where: {
        isActive: true,
        ...(input.slug ? { OR: [{ slug: input.slug }, { tenant: { slug: input.slug } }] } : host
          ? { OR: [{ domain: host }, { subdomain: host }, ...(hostLabel ? [{ subdomain: hostLabel }] : [])] }
          : path
            ? { pathPrefix: path }
            : { type: CareerPortalType.MARKETPLACE }),
      },
      include: { branding: true },
    });

    if (!portal) {
      throw new NotFoundException('Career portal not found');
    }

    return this.publicPortal(portal);
  }

  async listPublicVacancies(portalSlug: string | undefined, query: ListPublicVacanciesDto) {
    const portal = portalSlug ? await this.findPublicPortal(portalSlug) : null;
    const pagination = normalizeOffsetPagination(query);
    const now = new Date();
    const where: Prisma.JobPublicationWhereInput = {
      channel: portal ? this.channelForPortal(portal.type) : 'PUBLIC_MARKETPLACE',
      ...(portal ? { portalId: portal.id, tenantId: portal.tenantId ?? undefined } : {}),
      status: JobPublicationStatus.PUBLISHED,
      AND: [{ OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] }, { OR: [{ closesAt: null }, { closesAt: { gt: now } }] }],
      vacancy: {
        status: 'OPEN',
        ...(query.workMode ? { workMode: query.workMode } : {}),
        ...(query.employmentType ? { employmentType: query.employmentType } : {}),
        ...(query.city ? { city: { contains: query.city, mode: 'insensitive' } } : {}),
        ...(query.search
          ? { OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { summary: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { department: { contains: query.search, mode: 'insensitive' } },
            ] }
          : {}),
      },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.jobPublication.findMany({
        where,
        include: { tenant: { select: { id: true, slug: true, name: true } }, vacancy: { include: { branch: { select: { id: true, name: true, location: true } }, locations: { include: { branch: { select: { id: true, name: true, location: true } } }, orderBy: { isPrimary: 'desc' } } } } },
        orderBy: { publishedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.jobPublication.count({ where }),
    ]);
    return {
      data: items.map((item) => this.publicVacancy(item)),
      meta: { total, page: pagination.page, pageSize: pagination.pageSize, totalPages: Math.ceil(total / pagination.pageSize) },
      ...(portal ? { portal: this.publicPortal(portal) } : {}),
    };
  }

  async getPublicVacancy(publicSlug: string, portalSlug?: string) {
    const portal = portalSlug ? await this.findPublicPortal(portalSlug) : null;
    const now = new Date();
    const publication = await this.prisma.jobPublication.findFirst({
      where: {
        channel: portal ? this.channelForPortal(portal.type) : 'PUBLIC_MARKETPLACE',
        ...(portal ? { portalId: portal.id, tenantId: portal.tenantId ?? undefined } : {}),
        publicSlug,
        status: JobPublicationStatus.PUBLISHED,
        AND: [{ OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] }, { OR: [{ closesAt: null }, { closesAt: { gt: now } }] }],
        vacancy: { status: 'OPEN' },
      },
      include: { tenant: { select: { id: true, slug: true, name: true } }, vacancy: { include: { branch: { select: { id: true, name: true, location: true } }, locations: { include: { branch: { select: { id: true, name: true, location: true } } }, orderBy: { isPrimary: 'desc' } }, imageFiles: { where: { status: 'ACTIVE' }, orderBy: { version: 'desc' }, take: 1 } } } },
    });
    if (!publication) throw new NotFoundException('Published vacancy not found');
    return { ...this.publicVacancy(publication), ...(portal ? { portal: this.publicPortal(portal) } : {}) };
  }

  async validateInvitation(slug: string, rawToken: string) {
    const portal = await this.prisma.careerPortal.findFirst({ where: { slug, isActive: true }, select: { id: true, tenantId: true } });
    if (!portal) throw new NotFoundException('Career portal not found');
    const invitation = await this.prisma.applicantInvitation.findFirst({ where: { portalId: portal.id, tokenHash: this.hash(rawToken), acceptedAt: null, expiresAt: { gt: new Date() } }, select: { email: true, expiresAt: true } });
    if (!invitation) throw new NotFoundException('Portal invitation is invalid or expired');
    return { valid: true, email: invitation.email, expiresAt: invitation.expiresAt };
  }

  async acceptInvitation(slug: string, rawToken: string, identityId: string) {
    const portal = await this.prisma.careerPortal.findFirst({ where: { slug, isActive: true }, select: { id: true, tenantId: true } });
    if (!portal) throw new NotFoundException('Career portal not found');
    const [identity, invitation] = await this.prisma.$transaction([
      this.prisma.applicantIdentity.findUnique({ where: { id: identityId }, select: { email: true } }),
      this.prisma.applicantInvitation.findFirst({ where: { portalId: portal.id, tokenHash: this.hash(rawToken), acceptedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    if (!invitation || !identity || invitation.email.toLowerCase() !== identity.email.toLowerCase()) throw new ConflictException('Portal invitation does not match the applicant');
    await this.prisma.$transaction(async (tx) => {
      await tx.applicantInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date(), identityId } });
      if (portal.tenantId) {
        const profile = await tx.applicantProfile.findUnique({ where: { identityId }, select: { id: true } });
        await tx.companyApplicant.upsert({ where: { tenantId_identityId: { tenantId: portal.tenantId, identityId } }, update: { profileId: profile?.id }, create: { tenantId: portal.tenantId, identityId, profileId: profile?.id } });
      }
    });
    return { accepted: true, portalId: portal.id };
  }

  private async saveChannel(tx: Prisma.TransactionClient, tenant: { id: string; slug: string; name: string }, type: CareerPortalType, config: CareerPortalChannelConfigDto | undefined, defaultName: string) {
    if (!config) return;
    const existing = await tx.careerPortal.findFirst({ where: { tenantId: tenant.id, type } });
    const slug = config.slug?.trim().toLowerCase() || `${tenant.slug}-${type === CareerPortalType.COMPANY_PORTAL ? 'portal' : 'careers'}`;
    const data = {
      slug,
      name: config.name?.trim() || defaultName,
      type,
      access: config.access ?? CareerPortalAccess.PUBLIC,
      domain: config.domain?.trim().toLowerCase() || null,
      subdomain: config.subdomain?.trim().toLowerCase() || null,
      pathPrefix: this.normalizePath(config.pathPrefix) || null,
      isActive: config.enabled,
    };
    const portal = existing
      ? await tx.careerPortal.update({ where: { id: existing.id }, data })
      : await tx.careerPortal.create({ data: { ...data, tenantId: tenant.id } });
    if (config.branding) {
      await tx.careerPortalBranding.upsert({ where: { portalId: portal.id }, update: config.branding, create: { portalId: portal.id, ...config.branding } });
    }
  }

  private configChannel(portal: any) {
    if (!portal) return { enabled: false, portal: null };
    return {
      enabled: portal.isActive,
      portal: { id: portal.id, slug: portal.slug, name: portal.name, type: portal.type, access: portal.access, domain: portal.domain, subdomain: portal.subdomain, pathPrefix: portal.pathPrefix, branding: portal.branding },
    };
  }

  private async findPublicPortal(slug?: string) {
    const portal = await this.prisma.careerPortal.findFirst({
      where: {
        isActive: true,
        type: { in: [CareerPortalType.COMPANY_PORTAL, CareerPortalType.CAREER_SITE] },
        OR: [{ slug }, { tenant: { slug } }],
      },
      include: { branding: true },
    });
    if (!portal) throw new NotFoundException('Public career portal not found');
    return portal;
  }

  private normalizeHost(host?: string) {
    if (!host) return undefined;
    return host.split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  }

  private normalizePath(path?: string) {
    return path?.replace(/^\/+|\/+$/g, '') || undefined;
  }

  private channelForPortal(type: CareerPortalType) {
    return type === CareerPortalType.CAREER_SITE ? 'BRANDED_CAREER_SITE' : 'PRIVATE_COMPANY_PORTAL';
  }

  private publicPortal(portal: any) {
    return { id: portal.id, slug: portal.slug, name: portal.name, type: portal.type, access: portal.access, branding: portal.branding };
  }

  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }

  private publicVacancy(publication: any) {
    const vacancy = publication.vacancy;
    return {
      id: vacancy.id,
      publicationId: publication.id,
      slug: publication.publicSlug,
      title: vacancy.title,
      summary: vacancy.summary,
      description: vacancy.description,
      requirements: vacancy.requirements,
      responsibilities: vacancy.responsibilities,
      benefits: vacancy.benefits,
      city: vacancy.city,
      country: vacancy.country,
      department: vacancy.department,
      seniority: vacancy.seniority,
      workMode: vacancy.workMode,
      employmentType: vacancy.employmentType,
      openings: vacancy.openings,
      salaryMin: vacancy.salaryMin,
      salaryMax: vacancy.salaryMax,
      currency: vacancy.currency,
      imageUrl: vacancy.imageUrl,
      branch: vacancy.branch,
      locations: vacancy.locations,
      publishedAt: publication.publishedAt,
      tenant: publication.tenant,
    };
  }
}
