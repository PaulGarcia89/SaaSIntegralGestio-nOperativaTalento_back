import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { IntegrationEventStatus, OutboxEventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { MESSAGE_QUEUE_LIST } from '../messaging/messaging.constants';
import { MessageBusPort } from '../messaging/message-bus.port';
import { MESSAGE_BUS } from '../messaging/message-bus.tokens';

type TenantAccessSummary = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  subscriptionStatus: string | null;
  planName: string | null;
  activeUsers: number;
  recentLogins: number;
  lastSeenAt: string | null;
  users: Array<{
    id: string;
    email: string;
    name: string;
    status: string;
    lastSeenAt: string | null;
    lastLoginAt: string | null;
  }>;
};

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MESSAGE_BUS) private readonly messageBus: MessageBusPort,
  ) {}

  async getTenantActivity(actor: JwtPayload, requestedMinutes?: number) {
    this.ensureSuperAdmin(actor);

    const windowMinutes = this.normalizeWindowMinutes(requestedMinutes);
    const cutoff = new Date(Date.now() - windowMinutes * 60_000);

    const tenants = await this.prisma.tenant.findMany({
      include: {
        subscription: {
          include: { plan: true },
        },
        users: {
          where: {
            OR: [
              { lastSeenAt: { gte: cutoff } },
              { lastLoginAt: { gte: cutoff } },
            ],
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            lastSeenAt: true,
            lastLoginAt: true,
          },
          orderBy: [{ lastSeenAt: 'desc' }, { lastLoginAt: 'desc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const activeTenants = tenants
      .map<TenantAccessSummary>((tenant) => {
        const activeUsers = tenant.users.filter(
          (user) => user.lastSeenAt && user.lastSeenAt >= cutoff,
        );
        const recentLogins = tenant.users.filter(
          (user) => user.lastLoginAt && user.lastLoginAt >= cutoff,
        );
        const lastSeenAt = this.getLatestDate(
          tenant.users.flatMap((user) => [user.lastSeenAt, user.lastLoginAt]),
        );

        return {
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          tenantStatus: tenant.status,
          subscriptionStatus: tenant.subscription?.status ?? null,
          planName: tenant.subscription?.plan?.name ?? null,
          activeUsers: activeUsers.length,
          recentLogins: recentLogins.length,
          lastSeenAt: lastSeenAt?.toISOString() ?? null,
          users: tenant.users.map((user) => ({
            id: user.id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`.trim(),
            status: user.status,
            lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
            lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          })),
        };
      })
      .filter((tenant) => tenant.activeUsers > 0 || tenant.recentLogins > 0)
      .sort((left, right) => {
        const leftTime = left.lastSeenAt ? new Date(left.lastSeenAt).getTime() : 0;
        const rightTime = right.lastSeenAt ? new Date(right.lastSeenAt).getTime() : 0;
        return rightTime - leftTime;
      });

    return {
      generatedAt: new Date().toISOString(),
      windowMinutes,
      totalTenantsConfigured: tenants.length,
      totalActiveTenants: activeTenants.length,
      totalActiveUsers: activeTenants.reduce((sum, tenant) => sum + tenant.activeUsers, 0),
      tenants: activeTenants,
    };
  }

  async getActiveTenants(actor: JwtPayload, requestedMinutes?: number) {
    this.ensureSuperAdmin(actor);

    const windowMinutes = this.normalizeWindowMinutes(requestedMinutes);
    const cutoff = new Date(Date.now() - windowMinutes * 60_000);

    const logs = await this.prisma.auditLog.findMany({
      where: {
        createdAt: { gte: cutoff },
        tenantId: { not: null },
        statusCode: { lt: 400 },
      },
      select: {
        tenantId: true,
        userId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const summaries = new Map<
      string,
      { tenantId: string; requestCount: number; activeUsers: Set<string>; lastAccessAt: Date }
    >();

    for (const log of logs) {
      if (!log.tenantId) {
        continue;
      }

      const existing =
        summaries.get(log.tenantId) ??
        {
          tenantId: log.tenantId,
          requestCount: 0,
          activeUsers: new Set<string>(),
          lastAccessAt: log.createdAt,
        };

      existing.requestCount += 1;
      if (log.userId) {
        existing.activeUsers.add(log.userId);
      }
      if (log.createdAt > existing.lastAccessAt) {
        existing.lastAccessAt = log.createdAt;
      }

      summaries.set(log.tenantId, existing);
    }

    const tenantIds = [...summaries.keys()];
    const tenants = tenantIds.length
      ? await this.prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          include: {
            subscription: {
              include: { plan: true },
            },
          },
        })
      : [];

    const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    const items = [...summaries.values()]
      .map((summary) => {
        const tenant = tenantMap.get(summary.tenantId);
        if (!tenant) {
          return null;
        }

        return {
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          tenantStatus: tenant.status,
          subscriptionStatus: tenant.subscription?.status ?? null,
          planName: tenant.subscription?.plan?.name ?? null,
          requestCount: summary.requestCount,
          activeUsers: summary.activeUsers.size,
          lastAccessAt: summary.lastAccessAt.toISOString(),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((left, right) => right.lastAccessAt.localeCompare(left.lastAccessAt));

    return {
      generatedAt: new Date().toISOString(),
      windowMinutes,
      totalActiveTenants: items.length,
      tenants: items,
    };
  }

  async getActiveUsersByTenant(
    actor: JwtPayload,
    requestedMinutes?: number,
    tenantId?: string,
  ) {
    this.ensureSuperAdmin(actor);

    const windowMinutes = this.normalizeWindowMinutes(requestedMinutes);
    const cutoff = new Date(Date.now() - windowMinutes * 60_000);

    const where: Prisma.AuditLogWhereInput = {
      createdAt: { gte: cutoff },
      tenantId: tenantId ? tenantId : { not: null },
      userId: { not: null },
      statusCode: { lt: 400 },
    };

    const logs = await this.prisma.auditLog.findMany({
      where,
      select: {
        tenantId: true,
        userId: true,
        email: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const userIds = [...new Set(logs.flatMap((log) => (log.userId ? [log.userId] : [])))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            tenantId: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
          },
        })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user]));

    const tenantIds = [...new Set(logs.flatMap((log) => (log.tenantId ? [log.tenantId] : [])))];
    const tenants = tenantIds.length
      ? await this.prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true, slug: true, status: true },
        })
      : [];
    const tenantMap = new Map(tenants.map((item) => [item.id, item]));

    const grouped = new Map<
      string,
      {
        tenantId: string;
        tenantName: string;
        tenantSlug: string;
        tenantStatus: string;
        users: Map<
          string,
          {
            userId: string;
            email: string | null;
            name: string;
            status: string;
            lastAccessAt: Date;
            requestCount: number;
          }
        >;
      }
    >();

    for (const log of logs) {
      if (!log.tenantId || !log.userId) {
        continue;
      }

      const tenant = tenantMap.get(log.tenantId);
      if (!tenant) {
        continue;
      }

      const bucket =
        grouped.get(log.tenantId) ??
        {
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          tenantStatus: tenant.status,
          users: new Map(),
        };

      const userRecord = userMap.get(log.userId);
      const existing =
        bucket.users.get(log.userId) ??
        {
          userId: log.userId,
          email: userRecord?.email ?? log.email ?? null,
          name: userRecord ? `${userRecord.firstName} ${userRecord.lastName}`.trim() : '',
          status: userRecord?.status ?? 'UNKNOWN',
          lastAccessAt: log.createdAt,
          requestCount: 0,
        };

      existing.requestCount += 1;
      if (log.createdAt > existing.lastAccessAt) {
        existing.lastAccessAt = log.createdAt;
      }

      bucket.users.set(log.userId, existing);
      grouped.set(log.tenantId, bucket);
    }

    const tenantsWithUsers = [...grouped.values()]
      .map((entry) => ({
        tenantId: entry.tenantId,
        tenantName: entry.tenantName,
        tenantSlug: entry.tenantSlug,
        tenantStatus: entry.tenantStatus,
        activeUsers: [...entry.users.values()]
          .sort((left, right) => right.lastAccessAt.getTime() - left.lastAccessAt.getTime())
          .map((user) => ({
            userId: user.userId,
            email: user.email,
            name: user.name,
            status: user.status,
            requestCount: user.requestCount,
            lastAccessAt: user.lastAccessAt.toISOString(),
          })),
      }))
      .sort((left, right) => left.tenantName.localeCompare(right.tenantName));

    return {
      generatedAt: new Date().toISOString(),
      windowMinutes,
      tenantFilter: tenantId ?? null,
      tenants: tenantsWithUsers,
    };
  }

  async getLastAccessByTenant(actor: JwtPayload, requestedLimit?: number) {
    this.ensureSuperAdmin(actor);

    const limit = this.normalizeLimit(requestedLimit);
    const logs = await this.prisma.auditLog.findMany({
      where: {
        tenantId: { not: null },
        statusCode: { lt: 400 },
      },
      select: {
        tenantId: true,
        userId: true,
        email: true,
        route: true,
        method: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const firstLogByTenant = new Map<string, (typeof logs)[number]>();
    for (const log of logs) {
      if (!log.tenantId || firstLogByTenant.has(log.tenantId)) {
        continue;
      }

      firstLogByTenant.set(log.tenantId, log);
      if (firstLogByTenant.size >= limit) {
        break;
      }
    }

    const tenantIds = [...firstLogByTenant.keys()];
    const tenants = tenantIds.length
      ? await this.prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true, slug: true, status: true },
        })
      : [];
    const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));

    const userIds = [...new Set(logs.flatMap((log) => (log.userId ? [log.userId] : [])))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user]));

    const items = tenantIds
      .map((tenantIdValue) => {
        const log = firstLogByTenant.get(tenantIdValue);
        const tenant = tenantMap.get(tenantIdValue);
        if (!log || !tenant) {
          return null;
        }

        const actorUser = log.userId ? userMap.get(log.userId) : null;

        return {
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          tenantStatus: tenant.status,
          lastAccessAt: log.createdAt.toISOString(),
          lastRoute: log.route,
          lastMethod: log.method,
          actor: {
            userId: log.userId,
            email: actorUser?.email ?? log.email ?? null,
            name: actorUser
              ? `${actorUser.firstName} ${actorUser.lastName}`.trim()
              : null,
          },
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      generatedAt: new Date().toISOString(),
      limit,
      tenants: items,
    };
  }

  async getLoginActivity(
    actor: JwtPayload,
    fromInput?: string,
    toInput?: string,
    tenantId?: string,
  ) {
    this.ensureSuperAdmin(actor);

    const { from, to } = this.resolveDateRange(fromInput, toInput);
    const logs = await this.prisma.auditLog.findMany({
      where: {
        action: 'AUTH_LOGIN',
        createdAt: {
          gte: from,
          lte: to,
        },
        ...(tenantId ? { tenantId } : {}),
      },
      select: {
        tenantId: true,
        userId: true,
        email: true,
        statusCode: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const tenantIds = [...new Set(logs.flatMap((log) => (log.tenantId ? [log.tenantId] : [])))];
    const tenants = tenantIds.length
      ? await this.prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true, slug: true },
        })
      : [];
    const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));

    const byDate = new Map<
      string,
      {
        date: string;
        total: number;
        successful: number;
        failed: number;
        uniqueUsers: Set<string>;
        uniqueEmails: Set<string>;
      }
    >();

    for (const log of logs) {
      const date = log.createdAt.toISOString().slice(0, 10);
      const bucket =
        byDate.get(date) ??
        {
          date,
          total: 0,
          successful: 0,
          failed: 0,
          uniqueUsers: new Set<string>(),
          uniqueEmails: new Set<string>(),
        };

      bucket.total += 1;
      if (log.statusCode >= 200 && log.statusCode < 400) {
        bucket.successful += 1;
      } else {
        bucket.failed += 1;
      }

      if (log.userId) {
        bucket.uniqueUsers.add(log.userId);
      }
      if (log.email) {
        bucket.uniqueEmails.add(log.email.toLowerCase());
      }

      byDate.set(date, bucket);
    }

    const loginsByTenant = new Map<
      string,
      {
        tenantId: string;
        tenantName: string;
        tenantSlug: string;
        total: number;
        successful: number;
        failed: number;
      }
    >();

    for (const log of logs) {
      if (!log.tenantId) {
        continue;
      }

      const tenant = tenantMap.get(log.tenantId);
      if (!tenant) {
        continue;
      }

      const bucket =
        loginsByTenant.get(log.tenantId) ??
        {
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          total: 0,
          successful: 0,
          failed: 0,
        };

      bucket.total += 1;
      if (log.statusCode >= 200 && log.statusCode < 400) {
        bucket.successful += 1;
      } else {
        bucket.failed += 1;
      }

      loginsByTenant.set(log.tenantId, bucket);
    }

    return {
      generatedAt: new Date().toISOString(),
      from: from.toISOString(),
      to: to.toISOString(),
      tenantFilter: tenantId ?? null,
      summary: {
        total: logs.length,
        successful: logs.filter((log) => log.statusCode >= 200 && log.statusCode < 400).length,
        failed: logs.filter((log) => log.statusCode >= 400).length,
      },
      byDate: [...byDate.values()].map((entry) => ({
        date: entry.date,
        total: entry.total,
        successful: entry.successful,
        failed: entry.failed,
        uniqueUsers: entry.uniqueUsers.size,
        uniqueEmails: entry.uniqueEmails.size,
      })),
      byTenant: [...loginsByTenant.values()].sort((left, right) =>
        left.tenantName.localeCompare(right.tenantName),
      ),
    };
  }

  async getActiveBranches(
    actor: JwtPayload,
    requestedMinutes?: number,
    tenantId?: string,
  ) {
    this.ensureSuperAdmin(actor);

    const windowMinutes = this.normalizeWindowMinutes(requestedMinutes);
    const cutoff = new Date(Date.now() - windowMinutes * 60_000);
    const logs = await this.prisma.auditLog.findMany({
      where: {
        createdAt: { gte: cutoff },
        branchId: { not: null },
        statusCode: { lt: 400 },
        ...(tenantId ? { tenantId } : {}),
      },
      select: {
        tenantId: true,
        branchId: true,
        userId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const summaries = new Map<
      string,
      {
        branchId: string;
        tenantId: string | null;
        requestCount: number;
        activeUsers: Set<string>;
        lastAccessAt: Date;
      }
    >();

    for (const log of logs) {
      if (!log.branchId) {
        continue;
      }

      const existing =
        summaries.get(log.branchId) ?? {
          branchId: log.branchId,
          tenantId: log.tenantId ?? null,
          requestCount: 0,
          activeUsers: new Set<string>(),
          lastAccessAt: log.createdAt,
        };

      existing.requestCount += 1;
      if (log.userId) {
        existing.activeUsers.add(log.userId);
      }
      if (log.createdAt > existing.lastAccessAt) {
        existing.lastAccessAt = log.createdAt;
      }

      summaries.set(log.branchId, existing);
    }

    const branchIds = [...summaries.keys()];
    const branches = branchIds.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: branchIds } },
          select: {
            id: true,
            tenantId: true,
            name: true,
            location: true,
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
              },
            },
          },
        })
      : [];
    const branchMap = new Map(branches.map((branch) => [branch.id, branch]));

    const items = [...summaries.values()]
      .map((summary) => {
        const branch = branchMap.get(summary.branchId);
        if (!branch) {
          return null;
        }

        return {
          branchId: branch.id,
          branchName: branch.name,
          branchLocation: branch.location,
          tenantId: branch.tenant.id,
          tenantName: branch.tenant.name,
          tenantSlug: branch.tenant.slug,
          tenantStatus: branch.tenant.status,
          requestCount: summary.requestCount,
          activeUsers: summary.activeUsers.size,
          lastAccessAt: summary.lastAccessAt.toISOString(),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((left, right) => right.lastAccessAt.localeCompare(left.lastAccessAt));

    return {
      generatedAt: new Date().toISOString(),
      windowMinutes,
      tenantFilter: tenantId ?? null,
      totalActiveBranches: items.length,
      branches: items,
    };
  }

  async getActiveUsersByBranch(
    actor: JwtPayload,
    requestedMinutes?: number,
    tenantId?: string,
    branchId?: string,
  ) {
    this.ensureSuperAdmin(actor);

    const windowMinutes = this.normalizeWindowMinutes(requestedMinutes);
    const cutoff = new Date(Date.now() - windowMinutes * 60_000);
    const where: Prisma.AuditLogWhereInput = {
      createdAt: { gte: cutoff },
      branchId: branchId ? branchId : { not: null },
      userId: { not: null },
      statusCode: { lt: 400 },
      ...(tenantId ? { tenantId } : {}),
    };

    const logs = await this.prisma.auditLog.findMany({
      where,
      select: {
        branchId: true,
        tenantId: true,
        userId: true,
        email: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const userIds = [...new Set(logs.flatMap((log) => (log.userId ? [log.userId] : [])))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
          },
        })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user]));

    const branchIds = [...new Set(logs.flatMap((log) => (log.branchId ? [log.branchId] : [])))];
    const branches = branchIds.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: branchIds } },
          select: {
            id: true,
            tenantId: true,
            name: true,
            location: true,
          },
        })
      : [];
    const branchMap = new Map(branches.map((branch) => [branch.id, branch]));

    const grouped = new Map<
      string,
      {
        branchId: string;
        branchName: string;
        branchLocation: string;
        tenantId: string;
        users: Map<
          string,
          {
            userId: string;
            email: string | null;
            name: string;
            status: string;
            requestCount: number;
            lastAccessAt: Date;
          }
        >;
      }
    >();

    for (const log of logs) {
      if (!log.branchId || !log.userId) {
        continue;
      }

      const branch = branchMap.get(log.branchId);
      if (!branch) {
        continue;
      }

      const bucket =
        grouped.get(log.branchId) ?? {
          branchId: branch.id,
          branchName: branch.name,
          branchLocation: branch.location,
          tenantId: branch.tenantId,
          users: new Map(),
        };

      const userRecord = userMap.get(log.userId);
      const existing =
        bucket.users.get(log.userId) ?? {
          userId: log.userId,
          email: userRecord?.email ?? log.email ?? null,
          name: userRecord ? `${userRecord.firstName} ${userRecord.lastName}`.trim() : '',
          status: userRecord?.status ?? 'UNKNOWN',
          requestCount: 0,
          lastAccessAt: log.createdAt,
        };

      existing.requestCount += 1;
      if (log.createdAt > existing.lastAccessAt) {
        existing.lastAccessAt = log.createdAt;
      }

      bucket.users.set(log.userId, existing);
      grouped.set(log.branchId, bucket);
    }

    return {
      generatedAt: new Date().toISOString(),
      windowMinutes,
      tenantFilter: tenantId ?? null,
      branchFilter: branchId ?? null,
      branches: [...grouped.values()]
        .map((entry) => ({
          branchId: entry.branchId,
          branchName: entry.branchName,
          branchLocation: entry.branchLocation,
          tenantId: entry.tenantId,
          activeUsers: [...entry.users.values()]
            .sort((left, right) => right.lastAccessAt.getTime() - left.lastAccessAt.getTime())
            .map((user) => ({
              userId: user.userId,
              email: user.email,
              name: user.name,
              status: user.status,
              requestCount: user.requestCount,
              lastAccessAt: user.lastAccessAt.toISOString(),
            })),
        }))
        .sort((left, right) => left.branchName.localeCompare(right.branchName)),
    };
  }

  async getLastAccessByBranch(
    actor: JwtPayload,
    requestedLimit?: number,
    tenantId?: string,
  ) {
    this.ensureSuperAdmin(actor);

    const limit = this.normalizeLimit(requestedLimit);
    const logs = await this.prisma.auditLog.findMany({
      where: {
        branchId: { not: null },
        statusCode: { lt: 400 },
        ...(tenantId ? { tenantId } : {}),
      },
      select: {
        branchId: true,
        userId: true,
        email: true,
        route: true,
        method: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const firstLogByBranch = new Map<string, (typeof logs)[number]>();
    for (const log of logs) {
      if (!log.branchId || firstLogByBranch.has(log.branchId)) {
        continue;
      }

      firstLogByBranch.set(log.branchId, log);
      if (firstLogByBranch.size >= limit) {
        break;
      }
    }

    const branchIds = [...firstLogByBranch.keys()];
    const branches = branchIds.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: branchIds } },
          select: {
            id: true,
            tenantId: true,
            name: true,
            location: true,
          },
        })
      : [];
    const branchMap = new Map(branches.map((branch) => [branch.id, branch]));

    const userIds = [...new Set(logs.flatMap((log) => (log.userId ? [log.userId] : [])))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user]));

    return {
      generatedAt: new Date().toISOString(),
      limit,
      tenantFilter: tenantId ?? null,
      branches: branchIds
        .map((branchIdValue) => {
          const log = firstLogByBranch.get(branchIdValue);
          const branch = branchMap.get(branchIdValue);
          if (!log || !branch) {
            return null;
          }

          const actorUser = log.userId ? userMap.get(log.userId) : null;

          return {
            branchId: branch.id,
            branchName: branch.name,
            branchLocation: branch.location,
            tenantId: branch.tenantId,
            lastAccessAt: log.createdAt.toISOString(),
            lastRoute: log.route,
            lastMethod: log.method,
            actor: {
              userId: log.userId,
              email: actorUser?.email ?? log.email ?? null,
              name: actorUser ? `${actorUser.firstName} ${actorUser.lastName}`.trim() : null,
            },
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    };
  }

  async getBranchRequestActivity(
    actor: JwtPayload,
    fromInput?: string,
    toInput?: string,
    tenantId?: string,
    branchId?: string,
  ) {
    this.ensureSuperAdmin(actor);

    const { from, to } = this.resolveDateRange(fromInput, toInput);
    const logs = await this.prisma.auditLog.findMany({
      where: {
        createdAt: {
          gte: from,
          lte: to,
        },
        branchId: branchId ? branchId : { not: null },
        ...(tenantId ? { tenantId } : {}),
      },
      select: {
        branchId: true,
        tenantId: true,
        statusCode: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const branchIds = [...new Set(logs.flatMap((log) => (log.branchId ? [log.branchId] : [])))];
    const branches = branchIds.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: branchIds } },
          select: { id: true, tenantId: true, name: true, location: true },
        })
      : [];
    const branchMap = new Map(branches.map((branch) => [branch.id, branch]));

    const byBranch = new Map<
      string,
      {
        branchId: string;
        branchName: string;
        branchLocation: string;
        tenantId: string;
        total: number;
        successful: number;
        failed: number;
      }
    >();

    for (const log of logs) {
      if (!log.branchId) {
        continue;
      }

      const branch = branchMap.get(log.branchId);
      if (!branch) {
        continue;
      }

      const bucket =
        byBranch.get(log.branchId) ?? {
          branchId: branch.id,
          branchName: branch.name,
          branchLocation: branch.location,
          tenantId: branch.tenantId,
          total: 0,
          successful: 0,
          failed: 0,
        };

      bucket.total += 1;
      if (log.statusCode >= 200 && log.statusCode < 400) {
        bucket.successful += 1;
      } else {
        bucket.failed += 1;
      }

      byBranch.set(log.branchId, bucket);
    }

    return {
      generatedAt: new Date().toISOString(),
      from: from.toISOString(),
      to: to.toISOString(),
      tenantFilter: tenantId ?? null,
      branchFilter: branchId ?? null,
      summary: {
        total: logs.length,
        successful: logs.filter((log) => log.statusCode >= 200 && log.statusCode < 400).length,
        failed: logs.filter((log) => log.statusCode >= 400).length,
      },
      byBranch: [...byBranch.values()].sort((left, right) =>
        left.branchName.localeCompare(right.branchName),
      ),
    };
  }

  async getQueueOverview(
    actor: JwtPayload,
    fromInput?: string,
    toInput?: string,
    tenantId?: string,
  ) {
    const { from, to } = this.resolveDateRange(fromInput, toInput);
    const scopedTenantId = this.resolveOperationalTenantScope(actor, tenantId);
    const now = new Date();
    const tenantWhere = scopedTenantId ? { tenantId: scopedTenantId } : {};

    const [
      totalEvents,
      pendingEvents,
      retryingJobs,
      failedJobs,
      processedEvents,
      deadLetterOpen,
      statusGroups,
      queueDispatchGroups,
      latencyAggregate,
      processingDurations,
    ] = await Promise.all([
      this.prisma.outboxEvent.count({
        where: {
          createdAt: { gte: from, lte: to },
          ...tenantWhere,
        },
      }),
      this.prisma.outboxEvent.count({
        where: {
          status: { in: [OutboxEventStatus.PENDING, OutboxEventStatus.FAILED] },
          nextRetryAt: { lte: now },
          createdAt: { gte: from, lte: to },
          ...tenantWhere,
        },
      }),
      this.prisma.outboxEvent.count({
        where: {
          retryCount: { gt: 0 },
          status: {
            in: [
              OutboxEventStatus.PENDING,
              OutboxEventStatus.FAILED,
              OutboxEventStatus.PROCESSING,
            ],
          },
          createdAt: { gte: from, lte: to },
          ...tenantWhere,
        },
      }),
      this.prisma.outboxEvent.count({
        where: {
          status: OutboxEventStatus.FAILED,
          createdAt: { gte: from, lte: to },
          ...tenantWhere,
        },
      }),
      this.prisma.outboxEvent.count({
        where: {
          status: OutboxEventStatus.PROCESSED,
          processedAt: { gte: from, lte: to },
          ...tenantWhere,
        },
      }),
      this.prisma.deadLetterEvent.count({
        where: {
          resolvedAt: null,
          createdAt: { gte: from, lte: to },
          ...tenantWhere,
        },
      }),
      this.prisma.outboxEvent.groupBy({
        by: ['status'],
        where: {
          createdAt: { gte: from, lte: to },
          ...tenantWhere,
        },
        _count: { _all: true },
      }),
      this.prisma.outboxEventDispatch.groupBy({
        by: ['queueName', 'status'],
        where: {
          createdAt: { gte: from, lte: to },
          ...tenantWhere,
        },
        _count: { _all: true },
      }),
      this.prisma.outboxEvent.aggregate({
        where: {
          status: OutboxEventStatus.PROCESSED,
          processedAt: { not: null, gte: from, lte: to },
          ...tenantWhere,
        },
        _avg: { retryCount: true },
      }),
      this.getProcessingDurationMetrics(from, to, scopedTenantId),
    ]);

    const queueSummary = new Map<
      string,
      {
        queueName: string;
        pending: number;
        queued: number;
        acknowledged: number;
        failed: number;
        total: number;
      }
    >();

    for (const group of queueDispatchGroups) {
      const bucket =
        queueSummary.get(group.queueName) ??
        {
          queueName: group.queueName,
          pending: 0,
          queued: 0,
          acknowledged: 0,
          failed: 0,
          total: 0,
        };

      bucket.total += group._count._all;
      if (group.status === 'PENDING') {
        bucket.pending = group._count._all;
      }
      if (group.status === 'QUEUED') {
        bucket.queued = group._count._all;
      }
      if (group.status === 'ACKNOWLEDGED') {
        bucket.acknowledged = group._count._all;
      }
      if (group.status === 'FAILED') {
        bucket.failed = group._count._all;
      }

      queueSummary.set(group.queueName, bucket);
    }

    return {
      generatedAt: new Date().toISOString(),
      from: from.toISOString(),
      to: to.toISOString(),
      tenantScope: scopedTenantId ?? 'ALL',
      bus: {
        enabled: this.messageBus.isEnabled(),
        driver: this.messageBus.getDriverName(),
        workerCount: this.messageBus.isEnabled() ? MESSAGE_QUEUE_LIST.length : 0,
        queues: MESSAGE_QUEUE_LIST,
      },
      summary: {
        totalEvents,
        pendingEvents,
        retryingJobs,
        failedJobs,
        processedEvents,
        deadLetterOpen,
        averageRetryCount: Number(latencyAggregate._avg.retryCount ?? 0),
      },
      statusBreakdown: statusGroups.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
      queueStatus: [...queueSummary.values()].sort((left, right) =>
        left.queueName.localeCompare(right.queueName),
      ),
      performance: {
        averageProcessingMs: processingDurations.averageProcessingMs,
        p95ProcessingMs: processingDurations.p95ProcessingMs,
        averageEndToEndLatencyMs: processingDurations.averageLatencyMs,
        maxEndToEndLatencyMs: processingDurations.maxLatencyMs,
      },
    };
  }

  async getDeadLetterEvents(
    actor: JwtPayload,
    tenantId?: string,
    requestedLimit?: number,
  ) {
    const scopedTenantId = this.resolveOperationalTenantScope(actor, tenantId);
    const limit = this.normalizeLimit(requestedLimit);

    const events = await this.prisma.deadLetterEvent.findMany({
      where: {
        ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ resolvedAt: 'asc' }, { lastFailedAt: 'desc' }],
      take: limit,
    });

    return {
      generatedAt: new Date().toISOString(),
      tenantScope: scopedTenantId ?? 'ALL',
      limit,
      openCount: events.filter((event) => !event.resolvedAt).length,
      events: events.map((event) => ({
        id: event.id,
        outboxEventId: event.outboxEventId,
        dispatchId: event.dispatchId,
        queueName: event.queueName,
        eventName: event.eventName,
        eventVersion: event.eventVersion,
        tenant: event.tenant,
        branch: event.branch,
        retryCount: event.retryCount,
        reason: event.reason,
        correlationId: event.correlationId,
        firstFailedAt: event.firstFailedAt.toISOString(),
        lastFailedAt: event.lastFailedAt.toISOString(),
        resolvedAt: event.resolvedAt?.toISOString() ?? null,
        resolutionNote: event.resolutionNote ?? null,
      })),
    };
  }

  async getThroughputByDomain(
    actor: JwtPayload,
    fromInput?: string,
    toInput?: string,
    tenantId?: string,
  ) {
    const { from, to } = this.resolveDateRange(fromInput, toInput);
    const scopedTenantId = this.resolveOperationalTenantScope(actor, tenantId);

    const logs = await this.prisma.integrationEventLog.findMany({
      where: {
        occurredAt: { gte: from, lte: to },
        ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
      },
      select: {
        eventName: true,
        status: true,
        tenantId: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: 'asc' },
    });

    const byDomain = new Map<
      string,
      {
        domain: string;
        total: number;
        published: number;
        dispatched: number;
        processing: number;
        processed: number;
        failed: number;
        deadLetter: number;
        lastSeenAt: string | null;
      }
    >();

    for (const log of logs) {
      const domain = this.resolveDomainFromEventName(log.eventName);
      const bucket =
        byDomain.get(domain) ??
        {
          domain,
          total: 0,
          published: 0,
          dispatched: 0,
          processing: 0,
          processed: 0,
          failed: 0,
          deadLetter: 0,
          lastSeenAt: null,
        };

      bucket.total += 1;
      if (log.status === IntegrationEventStatus.PUBLISHED) {
        bucket.published += 1;
      }
      if (
        log.status === IntegrationEventStatus.DISPATCH_PENDING ||
        log.status === IntegrationEventStatus.DISPATCHED
      ) {
        bucket.dispatched += 1;
      }
      if (log.status === IntegrationEventStatus.PROCESSING) {
        bucket.processing += 1;
      }
      if (log.status === IntegrationEventStatus.PROCESSED) {
        bucket.processed += 1;
      }
      if (log.status === IntegrationEventStatus.FAILED) {
        bucket.failed += 1;
      }
      if (log.status === IntegrationEventStatus.DEAD_LETTER) {
        bucket.deadLetter += 1;
      }

      bucket.lastSeenAt = log.occurredAt.toISOString();
      byDomain.set(domain, bucket);
    }

    return {
      generatedAt: new Date().toISOString(),
      from: from.toISOString(),
      to: to.toISOString(),
      tenantScope: scopedTenantId ?? 'ALL',
      domains: [...byDomain.values()].sort((left, right) =>
        left.domain.localeCompare(right.domain),
      ),
    };
  }

  async getQueueErrorsByTenant(
    actor: JwtPayload,
    fromInput?: string,
    toInput?: string,
    tenantId?: string,
  ) {
    const { from, to } = this.resolveDateRange(fromInput, toInput);
    const scopedTenantId = this.resolveOperationalTenantScope(actor, tenantId);

    const logs = await this.prisma.integrationEventLog.findMany({
      where: {
        occurredAt: { gte: from, lte: to },
        status: {
          in: [IntegrationEventStatus.FAILED, IntegrationEventStatus.DEAD_LETTER],
        },
        ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
      },
      select: {
        tenantId: true,
        eventName: true,
        status: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: 'desc' },
    });

    const tenantIds = [...new Set(logs.map((log) => log.tenantId))];
    const tenants = tenantIds.length
      ? await this.prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true, slug: true, status: true },
        })
      : [];
    const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));

    const grouped = new Map<
      string,
      {
        tenantId: string;
        tenantName: string;
        tenantSlug: string;
        tenantStatus: string;
        failed: number;
        deadLetter: number;
        lastErrorAt: string | null;
        domains: Map<string, number>;
      }
    >();

    for (const log of logs) {
      const tenant = tenantMap.get(log.tenantId);
      if (!tenant) {
        continue;
      }

      const bucket =
        grouped.get(log.tenantId) ??
        {
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          tenantStatus: tenant.status,
          failed: 0,
          deadLetter: 0,
          lastErrorAt: null,
          domains: new Map<string, number>(),
        };

      if (log.status === IntegrationEventStatus.FAILED) {
        bucket.failed += 1;
      }
      if (log.status === IntegrationEventStatus.DEAD_LETTER) {
        bucket.deadLetter += 1;
      }

      bucket.lastErrorAt = bucket.lastErrorAt ?? log.occurredAt.toISOString();
      const domain = this.resolveDomainFromEventName(log.eventName);
      bucket.domains.set(domain, (bucket.domains.get(domain) ?? 0) + 1);
      grouped.set(log.tenantId, bucket);
    }

    return {
      generatedAt: new Date().toISOString(),
      from: from.toISOString(),
      to: to.toISOString(),
      tenantScope: scopedTenantId ?? 'ALL',
      tenants: [...grouped.values()]
        .map((entry) => ({
          tenantId: entry.tenantId,
          tenantName: entry.tenantName,
          tenantSlug: entry.tenantSlug,
          tenantStatus: entry.tenantStatus,
          failed: entry.failed,
          deadLetter: entry.deadLetter,
          totalErrors: entry.failed + entry.deadLetter,
          lastErrorAt: entry.lastErrorAt,
          domains: [...entry.domains.entries()]
            .map(([domain, count]) => ({ domain, count }))
            .sort((left, right) => right.count - left.count),
        }))
        .sort((left, right) => right.totalErrors - left.totalErrors),
    };
  }

  private ensureSuperAdmin(actor: JwtPayload) {
    if (!actor.isSuperAdmin) {
      throw new ForbiddenException('Only superadmins can view cross-tenant activity');
    }
  }

  private resolveOperationalTenantScope(actor: JwtPayload, tenantId?: string) {
    if (actor.isSuperAdmin) {
      return tenantId ?? null;
    }

    const activeTenantId = actor.activeTenantId ?? actor.tenantId;
    if (!tenantId) {
      return activeTenantId;
    }

    if (!actor.allowedTenantIds.includes(tenantId) && tenantId !== activeTenantId) {
      throw new ForbiddenException('Tenant scope is outside the authenticated context');
    }

    return tenantId;
  }

  private normalizeWindowMinutes(requestedMinutes?: number) {
    if (!requestedMinutes || Number.isNaN(requestedMinutes)) {
      return 30;
    }

    return Math.min(Math.max(Math.trunc(requestedMinutes), 5), 1_440);
  }

  private normalizeLimit(requestedLimit?: number) {
    if (!requestedLimit || Number.isNaN(requestedLimit)) {
      return 25;
    }

    return Math.min(Math.max(Math.trunc(requestedLimit), 1), 100);
  }

  private resolveDateRange(fromInput?: string, toInput?: string) {
    const to = toInput ? new Date(toInput) : new Date();
    if (Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid "to" date');
    }

    const from = fromInput
      ? new Date(fromInput)
      : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1_000);
    if (Number.isNaN(from.getTime())) {
      throw new BadRequestException('Invalid "from" date');
    }

    if (from > to) {
      throw new BadRequestException('"from" must be earlier than or equal to "to"');
    }

    return { from, to };
  }

  private getLatestDate(values: Array<Date | null | undefined>) {
    const dates = values.filter((value): value is Date => value instanceof Date);
    if (dates.length === 0) {
      return null;
    }

    return new Date(Math.max(...dates.map((value) => value.getTime())));
  }

  private resolveDomainFromEventName(eventName: string) {
    const [domain] = eventName.split('.');
    return domain || 'unknown';
  }

  private async getProcessingDurationMetrics(
    from: Date,
    to: Date,
    tenantId?: string | null,
  ) {
    const processingFilter = tenantId
      ? Prisma.sql`AND oe."tenantId" = ${tenantId}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{
        averageProcessingMs: number | null;
        p95ProcessingMs: number | null;
        averageLatencyMs: number | null;
        maxLatencyMs: number | null;
      }>
    >(Prisma.sql`
      WITH processing_windows AS (
        SELECT
          oe.id,
          EXTRACT(EPOCH FROM (processed_log."occurredAt" - processing_log."occurredAt")) * 1000 AS "processingMs",
          EXTRACT(EPOCH FROM (oe."processedAt" - oe."occurredAt")) * 1000 AS "latencyMs"
        FROM "OutboxEvent" oe
        JOIN LATERAL (
          SELECT il."occurredAt"
          FROM "IntegrationEventLog" il
          WHERE il."outboxEventId" = oe.id
            AND il.status = 'PROCESSING'
          ORDER BY il."occurredAt" ASC
          LIMIT 1
        ) processing_log ON TRUE
        JOIN LATERAL (
          SELECT il."occurredAt"
          FROM "IntegrationEventLog" il
          WHERE il."outboxEventId" = oe.id
            AND il.status = 'PROCESSED'
          ORDER BY il."occurredAt" ASC
          LIMIT 1
        ) processed_log ON TRUE
        WHERE oe.status = 'PROCESSED'
          AND oe."processedAt" IS NOT NULL
          AND oe."processedAt" BETWEEN ${from} AND ${to}
          ${processingFilter}
      )
      SELECT
        AVG("processingMs") AS "averageProcessingMs",
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "processingMs") AS "p95ProcessingMs",
        AVG("latencyMs") AS "averageLatencyMs",
        MAX("latencyMs") AS "maxLatencyMs"
      FROM processing_windows
    `);

    const metrics = rows[0];
    return {
      averageProcessingMs: Number(metrics?.averageProcessingMs ?? 0),
      p95ProcessingMs: Number(metrics?.p95ProcessingMs ?? 0),
      averageLatencyMs: Number(metrics?.averageLatencyMs ?? 0),
      maxLatencyMs: Number(metrics?.maxLatencyMs ?? 0),
    };
  }
}
