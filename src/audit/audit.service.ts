import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequestWithUser } from '../common/types/request-with-user.type';

type CreateAuditLogInput = {
  action?: string | null;
  branchId?: string | null;
  createdAt?: Date;
  email?: string | null;
  ip?: string | null;
  method: string;
  route: string;
  statusCode: number;
  tenantId?: string | null;
  userAgent?: string | null;
  userId?: string | null;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logHttpRequest(request: RequestWithUser, statusCode: number) {
    const route = this.resolveRoute(request);
    const method = this.normalizeMethod(request.method);
    const action = request.auditAction ?? this.deriveAction(method, route);
    const email = this.resolveEmail(request);
    const tenantId = await this.resolveTenantId(request, route);

    await this.safeCreate({
      action,
      branchId: request.branch?.id ?? request.user?.activeBranchId ?? null,
      email,
      ip: this.resolveIp(request),
      method,
      route,
      statusCode,
      tenantId,
      userAgent: this.resolveUserAgent(request),
      userId: request.user?.sub ?? null,
    });
  }

  async createAuditLog(input: CreateAuditLogInput) {
    await this.safeCreate(input);
  }

  private async safeCreate(input: CreateAuditLogInput) {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: input.action ?? null,
          branchId: input.branchId ?? null,
          createdAt: input.createdAt,
          email: input.email ?? null,
          ip: input.ip ?? null,
          method: input.method,
          route: input.route,
          statusCode: input.statusCode,
          tenantId: input.tenantId ?? null,
          userAgent: input.userAgent ?? null,
          userId: input.userId ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Audit log persistence failed for ${input.method} ${input.route}: ${this.stringifyError(error)}`,
      );
    }
  }

  private resolveRoute(request: RequestWithUser) {
    const routePath = typeof request.route?.path === 'string' ? request.route.path : '';
    const baseUrl = typeof request.baseUrl === 'string' ? request.baseUrl : '';
    const fallbackPath = request.originalUrl.split('?')[0] ?? request.path;

    if (routePath) {
      return `${baseUrl}${routePath}` || fallbackPath;
    }

    return fallbackPath;
  }

  private normalizeMethod(method: string) {
    return method.toUpperCase();
  }

  private resolveEmail(request: RequestWithUser) {
    if (request.user?.email) {
      return request.user.email;
    }

    const body = request.body;
    if (body && typeof body === 'object' && 'email' in body && typeof body.email === 'string') {
      return body.email;
    }

    return null;
  }

  private async resolveTenantId(request: RequestWithUser, route: string) {
    if (request.tenant?.id) {
      return request.tenant.id;
    }

    if (request.user?.tenantId) {
      return request.user.tenantId;
    }

    if (route === '/api/auth/login') {
      const body = request.body;
      if (body && typeof body === 'object' && 'tenantSlug' in body && typeof body.tenantSlug === 'string') {
        const tenant = await this.prisma.tenant.findUnique({
          where: { slug: body.tenantSlug },
          select: { id: true },
        });

        return tenant?.id ?? null;
      }
    }

    return null;
  }

  private resolveIp(request: RequestWithUser) {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
      return forwardedFor.split(',')[0].trim();
    }

    if (Array.isArray(forwardedFor) && forwardedFor[0]) {
      return forwardedFor[0];
    }

    return request.ip ?? null;
  }

  private resolveUserAgent(request: RequestWithUser) {
    const userAgent = request.headers['user-agent'];
    if (Array.isArray(userAgent)) {
      return userAgent[0] ?? null;
    }

    return userAgent ?? null;
  }

  private deriveAction(method: string, route: string) {
    if (route === '/api/auth/login' && method === 'POST') {
      return 'AUTH_LOGIN';
    }

    if (route === '/api/auth/refresh' && method === 'POST') {
      return 'AUTH_REFRESH';
    }

    if (method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE') {
      const segments = route
        .replace(/^\/api\//, '')
        .split('/')
        .filter((segment) => segment.length > 0);

      const resource = segments[0]?.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
      const actionVerb =
        method === 'POST' ? 'CREATE' : method === 'DELETE' ? 'DELETE' : 'UPDATE';

      if (resource) {
        return `${resource}_${actionVerb}`;
      }
    }

    return null;
  }

  private stringifyError(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return 'unknown error';
  }
}
