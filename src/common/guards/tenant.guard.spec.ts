import { HttpStatus } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';
import { AccessControlService } from '../../access-control/access-control.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccessScope } from '../enums/access-scope.enum';
import { RouteScope } from '../enums/route-scope.enum';
import { ErrorCode } from '../errors/error-code.enum';
import { ROUTE_SCOPE_KEY, TENANT_HEADER } from '../constants/auth.constants';
import {
  actor,
  executionContext,
  FakeRequest,
  platformAdmin,
  reflectorWith,
  request,
  superAdmin,
} from '../../../test/fixtures/auth-context.fixture';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

type TenantRow = { id: string; slug: string; name: string; status: string } | null;

function prismaWith(tenant: TenantRow) {
  return {
    tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
  } as unknown as PrismaService;
}

const activeTenant = { id: 'tenant-a', slug: 'tenant-a', name: 'Tenant A', status: 'ACTIVE' };

function build(options: {
  user?: JwtPayload;
  header?: string;
  routeScope?: RouteScope;
  tenant?: TenantRow;
}) {
  const req: FakeRequest = request({
    user: options.user,
    headers: options.header ? { [TENANT_HEADER]: options.header } : {},
  });
  const guard = new TenantGuard(
    prismaWith(options.tenant === undefined ? activeTenant : options.tenant),
    reflectorWith(options.routeScope ? { [ROUTE_SCOPE_KEY]: options.routeScope } : {}),
    new AccessControlService(),
  );
  return { guard, req, run: () => guard.canActivate(executionContext(req)) };
}

async function expectDenied(promise: Promise<unknown>, code: ErrorCode, status: HttpStatus) {
  await expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({ code, status }),
  });
}

describe('TenantGuard', () => {
  it('exige un usuario autenticado', async () => {
    const { run } = build({ user: undefined });
    await expectDenied(run(), ErrorCode.AUTH_REQUIRED, HttpStatus.UNAUTHORIZED);
  });

  it('omite la resolucion en rutas globales y marca el contexto', async () => {
    const { run, req } = build({ user: superAdmin(), routeScope: RouteScope.GLOBAL_ONLY });

    await expect(run()).resolves.toBe(true);
    expect(req.accessContext).toEqual({
      actorScope: AccessScope.GLOBAL,
      isGlobalRoute: true,
      resolvedTenantId: null,
    });
    expect(req.tenant).toBeUndefined();
  });

  it('resuelve el tenant activo del usuario y lo adjunta a la peticion', async () => {
    const { run, req } = build({ user: actor() });

    await expect(run()).resolves.toBe(true);
    expect(req.tenant).toEqual(activeTenant);
    expect(req.accessContext).toEqual({
      actorScope: AccessScope.BRANCH,
      isGlobalRoute: false,
      resolvedTenantId: 'tenant-a',
    });
  });

  it('acepta el encabezado que coincide con el tenant activo', async () => {
    const { run, req } = build({ user: actor(), header: 'tenant-a' });
    await expect(run()).resolves.toBe(true);
    expect(req.tenant?.id).toBe('tenant-a');
  });

  it('rechaza el encabezado que apunta a otro tenant', async () => {
    const { run } = build({ user: actor(), header: 'tenant-b' });
    // AccessControlService lanza ForbiddenException antes de tocar la base.
    await expect(run()).rejects.toThrow('You do not have access to this tenant resource');
  });

  it('exige contexto de tenant cuando no hay ninguno resoluble', async () => {
    const { run } = build({ user: actor({ activeTenantId: null }) });
    await expectDenied(run(), ErrorCode.TENANT_CONTEXT_REQUIRED, HttpStatus.FORBIDDEN);
  });

  it('exige contexto de tenant al superadmin que no envia encabezado', async () => {
    const { run } = build({ user: superAdmin() });
    await expectDenied(run(), ErrorCode.TENANT_CONTEXT_REQUIRED, HttpStatus.FORBIDDEN);
  });

  it('permite al superadmin usar cualquier tenant como contexto tecnico', async () => {
    const { run, req } = build({
      user: superAdmin(),
      header: 'tenant-a',
      tenant: activeTenant,
    });
    await expect(run()).resolves.toBe(true);
    expect(req.tenant?.id).toBe('tenant-a');
  });

  it('rechaza a PLATFORM_ADMIN que pide un tenant distinto de su activo', async () => {
    const { run } = build({ user: platformAdmin(), header: 'tenant-b' });
    await expect(run()).rejects.toThrow('You do not have access to this tenant resource');
  });

  it('devuelve 404 si el tenant resuelto no existe', async () => {
    const { run } = build({ user: actor(), tenant: null });
    await expectDenied(run(), ErrorCode.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
  });

  it('bloquea el acceso a un tenant que no esta activo', async () => {
    const { run } = build({
      user: actor(),
      tenant: { ...activeTenant, status: 'SUSPENDED' },
    });
    await expectDenied(run(), ErrorCode.TENANT_ACCESS_DENIED, HttpStatus.FORBIDDEN);
  });

  it('permite al superadmin entrar en un tenant suspendido', async () => {
    const { run, req } = build({
      user: superAdmin(),
      header: 'tenant-a',
      tenant: { ...activeTenant, status: 'SUSPENDED' },
    });
    await expect(run()).resolves.toBe(true);
    expect(req.tenant?.status).toBe('SUSPENDED');
  });

  it('usa el primer valor cuando el encabezado llega repetido', async () => {
    const req = request({ user: actor(), headers: { [TENANT_HEADER]: ['tenant-a', 'tenant-b'] } });
    const guard = new TenantGuard(prismaWith(activeTenant), reflectorWith({}), new AccessControlService());

    await expect(guard.canActivate(executionContext(req))).resolves.toBe(true);
    expect(req.tenant?.id).toBe('tenant-a');
  });

  it('respeta la impersonacion activa por encima del encabezado', async () => {
    const impersonating = superAdmin({
      impersonation: { active: true, tenantId: 'tenant-a', startedAt: null, reason: 'soporte' },
    });
    const { run, req } = build({ user: impersonating });
    await expect(run()).resolves.toBe(true);
    expect(req.tenant?.id).toBe('tenant-a');
  });
});
