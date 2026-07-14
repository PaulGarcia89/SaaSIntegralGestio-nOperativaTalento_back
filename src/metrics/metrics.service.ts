import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

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
  constructor(private readonly prisma: PrismaService) {}

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

  private ensureSuperAdmin(actor: JwtPayload) {
    if (!actor.isSuperAdmin) {
      throw new ForbiddenException('Only superadmins can view cross-tenant activity');
    }
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
}
