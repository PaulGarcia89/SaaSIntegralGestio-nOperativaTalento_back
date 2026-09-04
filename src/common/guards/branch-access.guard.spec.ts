import { HttpStatus } from '@nestjs/common';
import { BranchAccessGuard } from './branch-access.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RoleScope } from '../enums/role-scope.enum';
import { ErrorCode } from '../errors/error-code.enum';
import { BRANCH_HEADER } from '../constants/auth.constants';
import {
  actor,
  executionContext,
  FakeRequest,
  request,
  superAdmin,
  tenantAdmin,
} from '../../../test/fixtures/auth-context.fixture';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

const branchRow = { id: 'branch-1', tenantId: 'tenant-a', name: 'Principal', location: 'Miami' };

function prismaWith(branch: typeof branchRow | null, spy?: jest.Mock) {
  const findFirst = spy ?? jest.fn();
  findFirst.mockResolvedValue(branch);
  return { branch: { findFirst } } as unknown as PrismaService;
}

function build(options: {
  user?: JwtPayload;
  header?: string;
  tenantOnRequest?: boolean;
  branch?: typeof branchRow | null;
  findFirst?: jest.Mock;
}) {
  const req: FakeRequest = request({
    user: options.user,
    headers: options.header ? { [BRANCH_HEADER]: options.header } : {},
    ...(options.tenantOnRequest === false
      ? {}
      : { tenant: { id: 'tenant-a', slug: 'tenant-a', name: 'Tenant A', status: 'ACTIVE' } }),
  });
  const guard = new BranchAccessGuard(
    prismaWith(options.branch === undefined ? branchRow : options.branch, options.findFirst),
  );
  return { req, run: () => guard.canActivate(executionContext(req)) };
}

async function expectDenied(promise: Promise<unknown>, code: ErrorCode, status: HttpStatus) {
  await expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({ code, status }),
  });
}

describe('BranchAccessGuard', () => {
  it('exige contexto de tenant y usuario', async () => {
    const { run } = build({ user: undefined, tenantOnRequest: false });
    await expectDenied(run(), ErrorCode.TENANT_CONTEXT_REQUIRED, HttpStatus.FORBIDDEN);
  });

  it('rechaza el contexto global: no hay sucursal que resolver', async () => {
    const { run } = build({ user: superAdmin() });
    await expectDenied(run(), ErrorCode.BRANCH_CONTEXT_REQUIRED, HttpStatus.FORBIDDEN);
  });

  it('resuelve la sucursal activa y adjunta el alcance', async () => {
    const { run, req } = build({ user: actor() });

    await expect(run()).resolves.toBe(true);
    expect(req.branch).toEqual(branchRow);
    expect(req.branchScope).toEqual({ allowedBranchIds: ['branch-1'], activeBranchId: 'branch-1' });
  });

  it('rechaza si el encabezado contradice la sucursal activa', async () => {
    const { run } = build({ user: actor(), header: 'branch-9' });
    await expectDenied(run(), ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN);
  });

  it('acepta el encabezado que coincide con la sucursal activa', async () => {
    const { run, req } = build({ user: actor(), header: 'branch-1' });
    await expect(run()).resolves.toBe(true);
    expect(req.branch?.id).toBe('branch-1');
  });

  it('usa el encabezado cuando el usuario no tiene sucursal activa', async () => {
    const { run, req } = build({
      user: actor({ activeBranchId: null, allowedBranchIds: ['branch-1'] }),
      header: 'branch-1',
    });
    await expect(run()).resolves.toBe(true);
    expect(req.branch?.id).toBe('branch-1');
  });

  it('exige contexto de sucursal si no hay ni activa ni encabezado', async () => {
    const { run } = build({ user: actor({ activeBranchId: null }) });
    await expectDenied(run(), ErrorCode.BRANCH_CONTEXT_REQUIRED, HttpStatus.FORBIDDEN);
  });

  it('rechaza una sucursal fuera del alcance permitido', async () => {
    const { run } = build({
      user: actor({ activeBranchId: null, allowedBranchIds: ['branch-2'] }),
      header: 'branch-1',
    });
    await expectDenied(run(), ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN);
  });

  it('TENANT_ADMIN accede a cualquier sucursal de su tenant sin figurar en la lista', async () => {
    const { run, req } = build({
      user: tenantAdmin({ allowedBranchIds: [], activeBranchId: null }),
      header: 'branch-1',
    });
    await expect(run()).resolves.toBe(true);
    expect(req.branch?.id).toBe('branch-1');
  });

  it('el superadmin impersonando salta la comprobacion de lista', async () => {
    const { run } = build({
      user: superAdmin({
        isGlobalContext: false,
        allowedBranchIds: [],
        activeBranchId: 'branch-1',
        roleScope: RoleScope.BRANCH_USER,
      }),
    });
    await expect(run()).resolves.toBe(true);
  });

  it('devuelve 404 si la sucursal no pertenece al tenant activo', async () => {
    const { run } = build({ user: actor(), branch: null });
    await expectDenied(run(), ErrorCode.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
  });

  it('consulta siempre acotando por tenantId (aislamiento entre empresas)', async () => {
    const findFirst = jest.fn();
    const { run } = build({ user: actor(), findFirst });

    await run();

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'branch-1', tenantId: 'tenant-a' } }),
    );
  });

  it('cae al tenant del token cuando la peticion no trae tenant resuelto', async () => {
    const findFirst = jest.fn();
    const { run } = build({ user: actor(), tenantOnRequest: false, findFirst });

    await run();

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'branch-1', tenantId: 'tenant-a' } }),
    );
  });
});
