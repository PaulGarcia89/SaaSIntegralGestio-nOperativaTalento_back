import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import { ErrorCode } from '../errors/error-code.enum';

describe('PermissionGuard', () => {
  const context = (user: any) => ({
    getHandler: () => 'handler', getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as any;

  it('supports inventory.view as the read permission compatibility alias', () => {
    const reflector = { getAllAndOverride: jest.fn().mockImplementation((key: string) => key === 'required-permissions' ? ['inventory.read'] : undefined) } as unknown as Reflector;
    expect(new PermissionGuard(reflector).canActivate(context({ permissions: ['inventory.view'], role: 'USER', isGlobalContext: false }))).toBe(true);
  });

  it('rejects missing mutation permissions with the normalized error', () => {
    const reflector = { getAllAndOverride: jest.fn().mockImplementation((key: string) => key === 'required-permissions' ? ['inventory.confirm'] : undefined) } as unknown as Reflector;
    expect(() => new PermissionGuard(reflector).canActivate(context({ permissions: ['inventory.create'], role: 'USER', isGlobalContext: false }))).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: ErrorCode.PERMISSION_DENIED }) }));
  });
});

describe('PermissionGuard — cobertura de decisiones', () => {
  const context = (user: unknown) =>
    ({
      getHandler: () => 'handler',
      getClass: () => 'class',
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as never;

  const reflector = (metadata: Record<string, unknown>) =>
    ({ getAllAndOverride: (key: string) => metadata[key] }) as unknown as Reflector;

  const usuario = (permissions: string[], overrides: Record<string, unknown> = {}) => ({
    permissions,
    role: 'USER',
    isGlobalContext: false,
    ...overrides,
  });

  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('deja pasar cuando la ruta no exige permisos', () => {
    expect(new PermissionGuard(reflector({})).canActivate(context(usuario([])))).toBe(true);
  });

  it('trata las listas vacias como ausencia de requisito', () => {
    const guard = new PermissionGuard(
      reflector({ 'required-permissions': [], 'any-permissions': [] }),
    );
    expect(guard.canActivate(context(usuario([])))).toBe(true);
  });

  it('exige TODOS los permisos de required-permissions', () => {
    const guard = new PermissionGuard(reflector({ 'required-permissions': ['a.read', 'a.write'] }));
    expect(guard.canActivate(context(usuario(['a.read', 'a.write'])))).toBe(true);
    expect(() => guard.canActivate(context(usuario(['a.read'])))).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: ErrorCode.PERMISSION_DENIED }),
      }),
    );
  });

  it('exige AL MENOS UNO de any-permissions', () => {
    const guard = new PermissionGuard(reflector({ 'any-permissions': ['a.read', 'b.read'] }));
    expect(guard.canActivate(context(usuario(['b.read'])))).toBe(true);
    expect(() => guard.canActivate(context(usuario(['c.read'])))).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: ErrorCode.PERMISSION_DENIED }),
      }),
    );
  });

  it('combina required-permissions y any-permissions con AND', () => {
    const guard = new PermissionGuard(
      reflector({ 'required-permissions': ['a.read'], 'any-permissions': ['b.read', 'c.read'] }),
    );
    expect(guard.canActivate(context(usuario(['a.read', 'c.read'])))).toBe(true);
    expect(() => guard.canActivate(context(usuario(['a.read'])))).toThrow();
    expect(() => guard.canActivate(context(usuario(['c.read'])))).toThrow();
  });

  it('el superadmin en contexto global pasa por encima de cualquier permiso', () => {
    const guard = new PermissionGuard(reflector({ 'required-permissions': ['a.write'] }));
    expect(
      guard.canActivate(context(usuario([], { role: 'SUPERADMIN', isGlobalContext: true }))),
    ).toBe(true);
  });

  it('el superadmin fuera del contexto global si necesita el permiso', () => {
    const guard = new PermissionGuard(reflector({ 'required-permissions': ['a.write'] }));
    expect(() =>
      guard.canActivate(context(usuario([], { role: 'SUPERADMIN', isGlobalContext: false }))),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: ErrorCode.PERMISSION_DENIED }),
      }),
    );
  });

  it('tolera un usuario sin lista de permisos', () => {
    const guard = new PermissionGuard(reflector({ 'required-permissions': ['a.read'] }));
    expect(() => guard.canActivate(context({ role: 'USER', isGlobalContext: false }))).toThrow();
  });

  describe('alias legacy de inventario', () => {
    it('estan activos por defecto: inventory.manage aprueba ordenes de compra', () => {
      const guard = new PermissionGuard(
        reflector({ 'required-permissions': ['restaurant_inventory.purchase_orders.approve'] }),
      );
      expect(guard.canActivate(context(usuario(['inventory.manage'])))).toBe(true);
    });

    it('INVENTORY_LEGACY_PERMISSION_FALLBACK=false cierra la escalada', () => {
      process.env.INVENTORY_LEGACY_PERMISSION_FALLBACK = 'false';
      const guard = new PermissionGuard(
        reflector({ 'required-permissions': ['restaurant_inventory.purchase_orders.approve'] }),
      );
      expect(() => guard.canActivate(context(usuario(['inventory.manage'])))).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ code: ErrorCode.PERMISSION_DENIED }),
        }),
      );
    });

    it('con el fallback desactivado, el permiso granular sigue funcionando', () => {
      process.env.INVENTORY_LEGACY_PERMISSION_FALLBACK = 'false';
      const guard = new PermissionGuard(
        reflector({ 'required-permissions': ['restaurant_inventory.purchase_orders.approve'] }),
      );
      expect(
        guard.canActivate(context(usuario(['restaurant_inventory.purchase_orders.approve']))),
      ).toBe(true);
    });

    it('inventory.view e inventory.read son intercambiables en ambos sentidos', () => {
      const lectura = new PermissionGuard(reflector({ 'required-permissions': ['inventory.view'] }));
      expect(lectura.canActivate(context(usuario(['inventory.read'])))).toBe(true);
    });

    it('restaurant_inventory.manage cubre las mutaciones genericas de inventario', () => {
      for (const permiso of ['inventory.create', 'inventory.update', 'inventory.confirm', 'inventory.cancel']) {
        const guard = new PermissionGuard(reflector({ 'required-permissions': [permiso] }));
        expect(guard.canActivate(context(usuario(['restaurant_inventory.manage'])))).toBe(true);
      }
    });

    it('un permiso sin alias no se satisface con otro cualquiera', () => {
      const guard = new PermissionGuard(reflector({ 'required-permissions': ['employees.write'] }));
      expect(() => guard.canActivate(context(usuario(['inventory.manage'])))).toThrow();
    });

    it('any-permissions no aplica alias legacy (solo coincidencia exacta)', () => {
      const guard = new PermissionGuard(
        reflector({ 'any-permissions': ['restaurant_inventory.purchase_orders.approve'] }),
      );
      expect(() => guard.canActivate(context(usuario(['inventory.manage'])))).toThrow();
    });
  });
});
