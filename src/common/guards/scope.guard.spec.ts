import { HttpStatus } from '@nestjs/common';
import { ScopeGuard } from './scope.guard';
import { AccessScope } from '../enums/access-scope.enum';
import { RoleScope } from '../enums/role-scope.enum';
import { RouteScope } from '../enums/route-scope.enum';
import { ErrorCode } from '../errors/error-code.enum';
import { REQUIRED_SCOPE_KEY, ROUTE_SCOPE_KEY } from '../constants/auth.constants';
import {
  actor,
  branchAdmin,
  executionContext,
  platformAdmin,
  reflectorWith,
  request,
  superAdmin,
  tenantAdmin,
} from '../../../test/fixtures/auth-context.fixture';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

function run(
  user: JwtPayload | undefined,
  metadata: Record<string, unknown> = {},
  method = 'GET',
) {
  const guard = new ScopeGuard(reflectorWith(metadata));
  return () => guard.canActivate(executionContext(request({ user, method })));
}

function expectDenied(fn: () => unknown, code: ErrorCode, status = HttpStatus.FORBIDDEN) {
  expect(fn).toThrow(
    expect.objectContaining({ response: expect.objectContaining({ code, status }) }),
  );
}

describe('ScopeGuard', () => {
  it('exige un usuario autenticado', () => {
    expectDenied(run(undefined), ErrorCode.AUTH_REQUIRED, HttpStatus.UNAUTHORIZED);
  });

  it('deja pasar cuando la ruta no declara ningun alcance', () => {
    expect(run(actor())()).toBe(true);
  });

  describe('@RequireScope', () => {
    it('permite al actor cuyo scope figura en la lista', () => {
      expect(run(actor(), { [REQUIRED_SCOPE_KEY]: [AccessScope.BRANCH] })()).toBe(true);
    });

    it('rechaza al actor cuyo scope no figura', () => {
      expectDenied(
        run(actor(), { [REQUIRED_SCOPE_KEY]: [AccessScope.GLOBAL] }),
        ErrorCode.FORBIDDEN,
      );
    });

    it('rechaza incluso al superadmin si su scope no figura', () => {
      // La comprobacion de scope requerido es anterior al atajo de superadmin.
      expectDenied(
        run(superAdmin({ scope: AccessScope.TENANT }), { [REQUIRED_SCOPE_KEY]: [AccessScope.GLOBAL] }),
        ErrorCode.FORBIDDEN,
      );
    });

    it('ignora una lista vacia', () => {
      expect(run(actor(), { [REQUIRED_SCOPE_KEY]: [] })()).toBe(true);
    });
  });

  describe('@GlobalOnly', () => {
    const meta = { [ROUTE_SCOPE_KEY]: RouteScope.GLOBAL_ONLY };

    it('permite al actor de alcance global', () => {
      expect(run(superAdmin(), meta)()).toBe(true);
    });

    it('rechaza al administrador de tenant', () => {
      expectDenied(run(tenantAdmin(), meta), ErrorCode.FORBIDDEN);
    });

    it('rechaza al superadmin que no esta en contexto global', () => {
      expectDenied(run(superAdmin({ scope: AccessScope.TENANT }), meta), ErrorCode.FORBIDDEN);
    });
  });

  describe('@BranchLocal', () => {
    const meta = { [ROUTE_SCOPE_KEY]: RouteScope.BRANCH_LOCAL };

    it.each([
      ['PLATFORM_ADMIN', RoleScope.PLATFORM_ADMIN],
      ['TENANT_ADMIN', RoleScope.TENANT_ADMIN],
      ['BRANCH_ADMIN', RoleScope.BRANCH_ADMIN],
      ['BRANCH_USER', RoleScope.BRANCH_USER],
    ])('permite a %s', (_label, roleScope) => {
      expect(run(actor({ roleScope }), meta)()).toBe(true);
    });

    it('permite al superadmin por el atajo previo', () => {
      expect(run(superAdmin(), meta)()).toBe(true);
    });

    it('rechaza a un roleScope desconocido', () => {
      expectDenied(
        run(actor({ roleScope: 'guest' as RoleScope }), meta),
        ErrorCode.BRANCH_ACCESS_DENIED,
      );
    });
  });

  describe('@TenantWide', () => {
    const meta = { [ROUTE_SCOPE_KEY]: RouteScope.TENANT_WIDE };

    it.each([
      ['PLATFORM_ADMIN', RoleScope.PLATFORM_ADMIN],
      ['TENANT_ADMIN', RoleScope.TENANT_ADMIN],
      ['BRANCH_ADMIN', RoleScope.BRANCH_ADMIN],
    ])('permite leer (GET) a %s', (_label, roleScope) => {
      expect(run(actor({ roleScope }), meta, 'GET')()).toBe(true);
    });

    it('rechaza la lectura al usuario de sucursal', () => {
      expectDenied(run(actor({ roleScope: RoleScope.BRANCH_USER }), meta, 'GET'), ErrorCode.FORBIDDEN);
    });

    it.each([
      ['PLATFORM_ADMIN', RoleScope.PLATFORM_ADMIN],
      ['TENANT_ADMIN', RoleScope.TENANT_ADMIN],
    ])('permite escribir (POST) a %s', (_label, roleScope) => {
      expect(run(actor({ roleScope }), meta, 'POST')()).toBe(true);
    });

    it('rechaza la escritura al BRANCH_ADMIN, que si puede leer', () => {
      // Frontera exacta: BRANCH_ADMIN lee a nivel de tenant pero no escribe.
      expect(run(branchAdmin(), meta, 'GET')()).toBe(true);
      expectDenied(run(branchAdmin(), meta, 'POST'), ErrorCode.FORBIDDEN);
      expectDenied(run(branchAdmin(), meta, 'PATCH'), ErrorCode.FORBIDDEN);
      expectDenied(run(branchAdmin(), meta, 'DELETE'), ErrorCode.FORBIDDEN);
    });

    it('rechaza la escritura al usuario de sucursal', () => {
      expectDenied(run(actor({ roleScope: RoleScope.BRANCH_USER }), meta, 'POST'), ErrorCode.FORBIDDEN);
    });

    it('permite al superadmin por el atajo previo', () => {
      expect(run(superAdmin(), meta, 'DELETE')()).toBe(true);
    });

    it('permite a PLATFORM_ADMIN escribir', () => {
      expect(run(platformAdmin(), meta, 'PUT')()).toBe(true);
    });
  });
});
