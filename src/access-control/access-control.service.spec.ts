import { ForbiddenException } from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { AccessScope } from '../common/enums/access-scope.enum';
import { actor, platformAdmin, superAdmin } from '../../test/fixtures/auth-context.fixture';

describe('AccessControlService', () => {
  const service = new AccessControlService();

  describe('isGlobalActor / assertGlobalAccess', () => {
    it('reconoce al actor global', () => {
      expect(service.isGlobalActor(superAdmin())).toBe(true);
      expect(service.isGlobalActor(actor())).toBe(false);
    });

    it('deja pasar al actor global', () => {
      expect(() => service.assertGlobalAccess(superAdmin())).not.toThrow();
    });

    it('rechaza al actor de tenant', () => {
      expect(() => service.assertGlobalAccess(actor())).toThrow(ForbiddenException);
    });

    it('rechaza al actor de sucursal aunque sea superadmin sin alcance global', () => {
      expect(() => service.assertGlobalAccess(superAdmin({ scope: AccessScope.TENANT }))).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('resolveTenantId — impersonacion', () => {
    const impersonating = superAdmin({
      impersonation: { active: true, tenantId: 'tenant-b', startedAt: null, reason: 'soporte' },
    });

    it('fija el tenant al de la impersonacion', () => {
      expect(service.resolveTenantId(impersonating)).toBe('tenant-b');
    });

    it('acepta el encabezado si coincide con la impersonacion', () => {
      expect(service.resolveTenantId(impersonating, 'tenant-b')).toBe('tenant-b');
    });

    it('rechaza cualquier otro tenant durante la impersonacion', () => {
      expect(() => service.resolveTenantId(impersonating, 'tenant-c')).toThrow(ForbiddenException);
    });
  });

  describe('resolveTenantId — SUPERADMIN', () => {
    it('usa el tenant solicitado como contexto tecnico', () => {
      expect(service.resolveTenantId(superAdmin(), 'tenant-z')).toBe('tenant-z');
    });

    it('devuelve null si no se solicita ninguno', () => {
      expect(service.resolveTenantId(superAdmin())).toBeNull();
    });
  });

  describe('resolveTenantId — PLATFORM_ADMIN', () => {
    it('devuelve su tenant activo', () => {
      expect(service.resolveTenantId(platformAdmin())).toBe('tenant-a');
    });

    it('devuelve null si no tiene tenant activo', () => {
      expect(service.resolveTenantId(platformAdmin({ activeTenantId: null }))).toBeNull();
    });

    it('rechaza un tenant distinto del activo, aunque este en allowedTenantIds', () => {
      expect(() => service.resolveTenantId(platformAdmin(), 'tenant-b')).toThrow(ForbiddenException);
    });

    it('acepta el encabezado que coincide con el tenant activo', () => {
      expect(service.resolveTenantId(platformAdmin(), 'tenant-a')).toBe('tenant-a');
    });
  });

  describe('resolveTenantId — usuario normal', () => {
    it('devuelve su tenant activo', () => {
      expect(service.resolveTenantId(actor())).toBe('tenant-a');
    });

    it('rechaza un tenant ajeno pedido por encabezado', () => {
      expect(() => service.resolveTenantId(actor(), 'tenant-b')).toThrow(ForbiddenException);
    });

    it('acepta el encabezado que coincide con su tenant activo', () => {
      expect(service.resolveTenantId(actor(), 'tenant-a')).toBe('tenant-a');
    });
  });

  describe('assertTenantAccess', () => {
    it('permite al impersonador sobre el tenant impersonado', () => {
      const impersonating = superAdmin({
        impersonation: { active: true, tenantId: 'tenant-b', startedAt: null, reason: 'soporte' },
      });
      expect(() => service.assertTenantAccess(impersonating, 'tenant-b')).not.toThrow();
    });

    it('rechaza al impersonador sobre un tenant distinto del impersonado', () => {
      const impersonating = superAdmin({
        allowedTenantIds: [],
        impersonation: { active: true, tenantId: 'tenant-b', startedAt: null, reason: 'soporte' },
      });
      expect(() => service.assertTenantAccess(impersonating, 'tenant-c')).toThrow(ForbiddenException);
    });

    it('permite al superadmin no impersonando', () => {
      expect(() => service.assertTenantAccess(superAdmin(), 'cualquiera')).not.toThrow();
    });

    it('permite al usuario sobre un tenant de su lista', () => {
      expect(() => service.assertTenantAccess(actor(), 'tenant-a')).not.toThrow();
    });

    it('rechaza al usuario sobre un tenant fuera de su lista', () => {
      expect(() => service.assertTenantAccess(actor(), 'tenant-b')).toThrow(ForbiddenException);
    });
  });

  describe('buildTenantWhere', () => {
    it('acota por tenant cuando se resuelve uno', () => {
      expect(service.buildTenantWhere(actor())).toEqual({ tenantId: 'tenant-a' });
    });

    it('devuelve un filtro vacio solo cuando no hay tenant resoluble (superadmin global)', () => {
      // Documenta el comportamiento fail-open: quien invoque este helper sin
      // TenantGuard delante veria todos los tenants.
      expect(service.buildTenantWhere(superAdmin())).toEqual({});
    });

    it('propaga el rechazo si el tenant solicitado es ajeno', () => {
      expect(() => service.buildTenantWhere(actor(), 'tenant-b')).toThrow(ForbiddenException);
    });
  });
});
