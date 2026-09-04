import { HttpStatus } from '@nestjs/common';
import { SubscriptionGuard } from './subscription.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContextService } from '../auth/auth-context.service';
import { SubscriptionAccessState } from '../auth/subscription-access-state.enum';
import { RouteScope } from '../enums/route-scope.enum';
import { ErrorCode } from '../errors/error-code.enum';
import { ALLOWED_SUBSCRIPTION_STATES_KEY, ROUTE_SCOPE_KEY } from '../constants/auth.constants';
import {
  actor,
  executionContext,
  FakeRequest,
  reflectorWith,
  request,
  superAdmin,
} from '../../../test/fixtures/auth-context.fixture';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

const subscriptionRow = {
  id: 'sub-1',
  planId: 'plan-1',
  status: 'ACTIVE',
  endsAt: null as Date | null,
};

function build(options: {
  user?: JwtPayload;
  subscription?: typeof subscriptionRow | null;
  accessStatus?: SubscriptionAccessState;
  allowedStates?: SubscriptionAccessState[];
  routeScope?: RouteScope;
  modules?: string[];
  tenantOnRequest?: boolean;
}) {
  const prisma = {
    subscription: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.subscription === undefined ? subscriptionRow : options.subscription),
    },
  } as unknown as PrismaService;

  const authContext = {
    resolveSubscriptionState: jest
      .fn()
      .mockReturnValue(options.accessStatus ?? SubscriptionAccessState.ACTIVE),
    getTenantCapabilities: jest
      .fn()
      .mockResolvedValue({ enabledModules: options.modules ?? ['RECRUITMENT'] }),
  } as unknown as AuthContextService;

  const metadata: Record<string, unknown> = {};
  if (options.routeScope) metadata[ROUTE_SCOPE_KEY] = options.routeScope;
  if (options.allowedStates) metadata[ALLOWED_SUBSCRIPTION_STATES_KEY] = options.allowedStates;

  const req: FakeRequest = request({
    user: options.user ?? actor(),
    ...(options.tenantOnRequest === false
      ? {}
      : { tenant: { id: 'tenant-a', slug: 'tenant-a', name: 'Tenant A', status: 'ACTIVE' } }),
  });

  const guard = new SubscriptionGuard(prisma, authContext, reflectorWith(metadata));
  return { req, prisma, run: () => guard.canActivate(executionContext(req)) };
}

async function expectDenied(promise: Promise<unknown>, code: ErrorCode, status: HttpStatus) {
  await expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({ code, status }),
  });
}

describe('SubscriptionGuard', () => {
  it('omite la validacion en rutas globales', async () => {
    const { run, req } = build({ user: superAdmin(), routeScope: RouteScope.GLOBAL_ONLY });
    await expect(run()).resolves.toBe(true);
    expect(req.subscription).toBeUndefined();
  });

  it('exige contexto de tenant', async () => {
    const { run } = build({ user: actor({ activeTenantId: null, tenantId: '' }), tenantOnRequest: false });
    await expectDenied(run(), ErrorCode.TENANT_CONTEXT_REQUIRED, HttpStatus.FORBIDDEN);
  });

  it('el superadmin en contexto global no queda sujeto a la suscripcion', async () => {
    const { run, req } = build({ user: superAdmin({ activeTenantId: 'tenant-a' }) });
    await expect(run()).resolves.toBe(true);
    expect(req.subscription).toBeUndefined();
  });

  it('bloquea al tenant sin suscripcion asignada', async () => {
    const { run } = build({ subscription: null });
    await expectDenied(run(), ErrorCode.SUBSCRIPTION_BLOCKED, HttpStatus.FORBIDDEN);
  });

  it.each([
    SubscriptionAccessState.ACTIVE,
    SubscriptionAccessState.TRIALING,
    SubscriptionAccessState.GRACE_PERIOD,
  ])('permite el estado %s con la politica por defecto', async (accessStatus) => {
    const { run, req } = build({ accessStatus });
    await expect(run()).resolves.toBe(true);
    expect(req.subscription?.accessStatus).toBe(accessStatus);
  });

  it.each([SubscriptionAccessState.PAST_DUE, SubscriptionAccessState.SUSPENDED])(
    'bloquea el estado %s con la politica por defecto',
    async (accessStatus) => {
      const { run } = build({ accessStatus });
      await expectDenied(run(), ErrorCode.SUBSCRIPTION_BLOCKED, HttpStatus.FORBIDDEN);
    },
  );

  it('respeta una lista de estados permitidos mas restrictiva', async () => {
    const { run } = build({
      accessStatus: SubscriptionAccessState.GRACE_PERIOD,
      allowedStates: [SubscriptionAccessState.ACTIVE],
    });
    await expectDenied(run(), ErrorCode.SUBSCRIPTION_BLOCKED, HttpStatus.FORBIDDEN);
  });

  it('respeta una lista de estados permitidos mas amplia', async () => {
    const { run } = build({
      accessStatus: SubscriptionAccessState.SUSPENDED,
      allowedStates: [SubscriptionAccessState.SUSPENDED],
    });
    await expect(run()).resolves.toBe(true);
  });

  it('adjunta las capacidades del tenant, no las del token', async () => {
    const { run, req } = build({ modules: ['TRAINING', 'INVENTORY'] });
    await expect(run()).resolves.toBe(true);
    expect(req.subscription?.modules).toEqual(['TRAINING', 'INVENTORY']);
    expect(req.subscription?.id).toBe('sub-1');
    expect(req.subscription?.planId).toBe('plan-1');
  });

  it('expone graceEndsAt solo durante el periodo de gracia', async () => {
    const endsAt = new Date('2026-12-31T00:00:00.000Z');
    const enGracia = build({
      accessStatus: SubscriptionAccessState.GRACE_PERIOD,
      subscription: { ...subscriptionRow, status: 'PAST_DUE', endsAt },
    });
    await enGracia.run();
    expect(enGracia.req.subscription?.graceEndsAt).toBe(endsAt.toISOString());

    const activa = build({ accessStatus: SubscriptionAccessState.ACTIVE });
    await activa.run();
    expect(activa.req.subscription?.graceEndsAt).toBeNull();
  });

  it('consulta la suscripcion del tenant resuelto en la peticion', async () => {
    const { run, prisma } = build({});
    await run();
    expect((prisma.subscription.findUnique as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-a' } }),
    );
  });
});
