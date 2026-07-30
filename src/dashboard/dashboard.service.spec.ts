import { DashboardService } from './dashboard.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

describe('DashboardService', () => {
  it('prioriza alertas globales reales y conserva su procedencia', async () => {
    const prisma = {
      tenant: { count: jest.fn().mockResolvedValue(3) },
      subscription: { count: jest.fn().mockResolvedValue(1) },
      automationExecution: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'execution-1',
            updatedAt: new Date('2026-07-30T12:00:00.000Z'),
            tenant: { name: 'Empresa prueba' },
            rule: { name: 'Activar onboarding' },
          },
        ]),
      },
      notificationDelivery: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      outboxEvent: { count: jest.fn().mockResolvedValue(2) },
    };
    const service = new DashboardService(prisma as never);
    const actor = {
      isSuperAdmin: true,
      isGlobalContext: true,
      role: 'ADMIN_SAAS',
      roles: ['ADMIN_SAAS'],
    } as JwtPayload;

    const result = await service.operational(actor);

    expect(result.source).toBe('Datos operativos persistentes');
    expect(result.scope).toBe('GLOBAL');
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'tenants', value: 3 }),
        expect.objectContaining({ key: 'events', value: 2 }),
      ]),
    );
    expect(result.nextAction).toEqual(
      expect.objectContaining({
        id: 'execution-1',
        title: 'Automatización fallida',
        href: '/admin/queues',
      }),
    );
  });
});
