import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from '../common/guards/permission.guard';

describe('Restaurant inventory permissions by role', () => {
  const context = (user: any): ExecutionContext => ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any);

  const guard = (permissions: string[]) => new PermissionGuard({
    getAllAndOverride: jest.fn()
      .mockImplementationOnce(() => permissions)
      .mockImplementationOnce(() => undefined),
  } as unknown as Reflector);

  it('allows read permission and its legacy view alias', () => {
    expect(guard(['inventory.read']).canActivate(context({ permissions: ['inventory.view'] }))).toBe(true);
  });

  it('denies confirmation to a read-only role', () => {
    expect(() => guard(['inventory.confirm']).canActivate(context({ permissions: ['inventory.read'] }))).toThrow('required permissions');
  });

  it('allows global superadmin without weakening tenant permissions for other roles', () => {
    expect(guard(['inventory.confirm']).canActivate(context({ role: 'SUPERADMIN', isGlobalContext: true, permissions: [] }))).toBe(true);
    expect(() => guard(['inventory.report.view']).canActivate(context({ role: 'ADMIN', isGlobalContext: false, permissions: ['inventory.read'] }))).toThrow();
  });

  it.each([
    ['Administrador', ['restaurant_inventory.expiry_alerts.view', 'restaurant_inventory.counts.schedule', 'restaurant_inventory.variance.view', 'restaurant_inventory.shrinkage.view', 'restaurant_inventory.audit.read'], 'restaurant_inventory.audit.read', true],
    ['Supervisor', ['restaurant_inventory.expiry_alerts.view', 'restaurant_inventory.variance.view', 'restaurant_inventory.shrinkage.view', 'restaurant_inventory.audit.read'], 'restaurant_inventory.variance.view', true],
    ['Encargado de inventario', ['restaurant_inventory.counts.schedule'], 'restaurant_inventory.counts.schedule', true],
    ['Operador', [], 'restaurant_inventory.expiry_alerts.view', false],
    ['Usuario sin acceso', [], 'restaurant_inventory.audit.read', false],
  ])('aplica permisos avanzados por rol: %s', (_role, permissions, required, allowed) => {
    const run = () => guard([required]).canActivate(context({ permissions, role: 'USER', isGlobalContext: false }));
    if (allowed) expect(run()).toBe(true);
    else expect(run).toThrow();
  });

  it('allows controlled legacy fallback and can disable it explicitly', () => {
    const previous = process.env.INVENTORY_LEGACY_PERMISSION_FALLBACK;
    delete process.env.INVENTORY_LEGACY_PERMISSION_FALLBACK;
    expect(guard(['restaurant_inventory.variance.view']).canActivate(context({ permissions: ['restaurant_inventory.manage'], role: 'USER', isGlobalContext: false }))).toBe(true);
    process.env.INVENTORY_LEGACY_PERMISSION_FALLBACK = 'false';
    expect(() => guard(['restaurant_inventory.variance.view']).canActivate(context({ permissions: ['restaurant_inventory.manage'], role: 'USER', isGlobalContext: false }))).toThrow();
    if (previous === undefined) delete process.env.INVENTORY_LEGACY_PERMISSION_FALLBACK; else process.env.INVENTORY_LEGACY_PERMISSION_FALLBACK = previous;
  });

  it('requires the commercial intelligence permission for commercial reports', () => {
    expect(guard(['restaurant_inventory.commercial.view']).canActivate(context({ permissions: ['restaurant_inventory.commercial.view'] }))).toBe(true);
    expect(() => guard(['restaurant_inventory.commercial.view']).canActivate(context({ permissions: ['restaurant_inventory.read'] }))).toThrow();
  });

  it('keeps commissary and budget operations separate from report access', () => {
    expect(guard(['restaurant_inventory.commissary.manage']).canActivate(context({ permissions: ['restaurant_inventory.commissary.manage'] }))).toBe(true);
    expect(() => guard(['restaurant_inventory.budgets.manage']).canActivate(context({ permissions: ['restaurant_inventory.commercial.view'] }))).toThrow();
  });

  it('requires commissary management permission for commissary mutations', () => {
    expect(guard(['restaurant_inventory.commissary.manage']).canActivate(context({ permissions: ['restaurant_inventory.commissary.manage'] }))).toBe(true);
    expect(() => guard(['restaurant_inventory.commissary.manage']).canActivate(context({ permissions: ['restaurant_inventory.commercial.view'] }))).toThrow();
  });
});
