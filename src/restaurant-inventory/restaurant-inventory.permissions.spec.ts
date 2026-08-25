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
});
