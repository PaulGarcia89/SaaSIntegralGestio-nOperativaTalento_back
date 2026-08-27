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
