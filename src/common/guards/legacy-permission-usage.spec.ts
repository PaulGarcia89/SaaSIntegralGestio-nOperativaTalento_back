import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import { RegistroDeAliasLegacy, aliasLegacyActivos, registroDeAliasLegacy } from './legacy-permission-usage';

describe('RegistroDeAliasLegacy', () => {
  let registro: RegistroDeAliasLegacy;

  beforeEach(() => {
    registro = new RegistroDeAliasLegacy();
  });

  it('registra el primer uso con su tenant', () => {
    registro.registrar('restaurant_inventory.purchase_orders.approve', 'inventory.manage', 'tenant-a');
    const informe = registro.informe();

    expect(informe).toHaveLength(1);
    expect(informe[0]).toMatchObject({
      permiso: 'restaurant_inventory.purchase_orders.approve',
      alias: 'inventory.manage',
      ocurrencias: 1,
      tenants: ['tenant-a'],
    });
  });

  it('acumula ocurrencias y tenants distintos en la misma combinacion', () => {
    for (const tenant of ['tenant-a', 'tenant-b', 'tenant-a']) {
      registro.registrar('inventory.confirm', 'restaurant_inventory.manage', tenant);
    }

    const [uso] = registro.informe();
    expect(uso.ocurrencias).toBe(3);
    expect(uso.tenants.sort()).toEqual(['tenant-a', 'tenant-b']);
  });

  it('separa combinaciones distintas de permiso y alias', () => {
    registro.registrar('inventory.create', 'restaurant_inventory.manage', 'tenant-a');
    registro.registrar('inventory.update', 'restaurant_inventory.manage', 'tenant-a');

    expect(registro.resumen()).toMatchObject({ combinaciones: 2, ocurrencias: 2, tenantsAfectados: 1 });
  });

  it('ordena el informe por uso descendente', () => {
    registro.registrar('a.x', 'alias-1', 't');
    registro.registrar('b.y', 'alias-2', 't');
    registro.registrar('b.y', 'alias-2', 't');

    expect(registro.informe()[0].permiso).toBe('b.y');
  });

  it('tolera la ausencia de tenant', () => {
    registro.registrar('inventory.read', 'inventory.view', null);
    expect(registro.informe()[0].tenants).toEqual([]);
  });
});

describe('aliasLegacyActivos', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('esta activo por defecto (comportamiento actual)', () => {
    delete process.env.INVENTORY_LEGACY_PERMISSION_FALLBACK;
    expect(aliasLegacyActivos()).toBe(true);
  });

  it('solo se apaga con el valor exacto "false"', () => {
    process.env.INVENTORY_LEGACY_PERMISSION_FALLBACK = 'false';
    expect(aliasLegacyActivos()).toBe(false);
    process.env.INVENTORY_LEGACY_PERMISSION_FALLBACK = 'no';
    expect(aliasLegacyActivos()).toBe(true);
  });
});

describe('PermissionGuard — telemetria de alias', () => {
  const context = (user: unknown, tenantId = 'tenant-a') =>
    ({
      getHandler: () => 'handler',
      getClass: () => 'class',
      switchToHttp: () => ({ getRequest: () => ({ user, tenant: { id: tenantId } }) }),
    }) as never;

  const reflector = (metadata: Record<string, unknown>) =>
    ({ getAllAndOverride: (key: string) => metadata[key] }) as unknown as Reflector;

  beforeEach(() => registroDeAliasLegacy.limpiar());

  it('anota cuando un permiso se concede solo por un alias legacy', () => {
    const guard = new PermissionGuard(
      reflector({ 'required-permissions': ['restaurant_inventory.purchase_orders.approve'] }),
    );

    expect(
      guard.canActivate(
        context({ permissions: ['inventory.manage'], role: 'USER', isGlobalContext: false }),
      ),
    ).toBe(true);

    expect(registroDeAliasLegacy.informe()).toEqual([
      expect.objectContaining({
        permiso: 'restaurant_inventory.purchase_orders.approve',
        alias: 'inventory.manage',
        tenants: ['tenant-a'],
      }),
    ]);
  });

  it('no anota nada cuando el permiso es exacto', () => {
    const guard = new PermissionGuard(
      reflector({ 'required-permissions': ['restaurant_inventory.purchase_orders.approve'] }),
    );

    guard.canActivate(
      context({
        permissions: ['restaurant_inventory.purchase_orders.approve'],
        role: 'USER',
        isGlobalContext: false,
      }),
    );

    expect(registroDeAliasLegacy.informe()).toEqual([]);
  });

  it('no anota nada cuando el acceso se deniega', () => {
    const guard = new PermissionGuard(
      reflector({
        'required-permissions': ['restaurant_inventory.purchase_orders.approve', 'otro.permiso'],
      }),
    );

    expect(() =>
      guard.canActivate(
        context({ permissions: ['inventory.manage'], role: 'USER', isGlobalContext: false }),
      ),
    ).toThrow();

    // El alias resolvio uno de los dos permisos, pero la peticion fue rechazada:
    // no debe contarse como dependencia real del atajo.
    expect(registroDeAliasLegacy.informe()).toEqual([]);
  });

  it('anota tambien los alias directos de inventory.* que no dependen del flag', () => {
    const guard = new PermissionGuard(reflector({ 'required-permissions': ['inventory.read'] }));

    guard.canActivate(
      context({ permissions: ['inventory.view'], role: 'USER', isGlobalContext: false }),
    );

    expect(registroDeAliasLegacy.informe()[0]).toMatchObject({
      permiso: 'inventory.read',
      alias: 'inventory.view',
    });
  });
});
