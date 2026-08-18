import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductivityService } from './productivity.service';

describe('ProductivityService persistence', () => {
  const transaction = {
    productivityEvent: { create: jest.fn() },
    productivityCamera: { update: jest.fn() },
  };
  const prisma = {
    productivityCamera: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    productivityZone: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    productivityEvent: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)),
  };
  const service = new ProductivityService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.productivityCamera.findFirst.mockResolvedValue({
      id: 'camera-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
    });
    prisma.productivityZone.findFirst.mockResolvedValue({
      id: 'zone-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      cameraId: 'camera-1',
    });
    prisma.productivityEvent.findFirst.mockResolvedValue(null);
    transaction.productivityEvent.create.mockResolvedValue({ id: 'event-1' });
    transaction.productivityCamera.update.mockResolvedValue({ id: 'camera-1' });
  });

  it('persists a demo event transactionally with tenant, branch, duration and source', async () => {
    const result = await service.createDemoEvent('tenant-1', {
      cameraId: 'camera-1',
      zoneId: 'zone-1',
      eventType: ' TASK_DETECTED ',
      startedAt: '2026-08-18T10:00:00.000Z',
      endedAt: '2026-08-18T10:01:30.000Z',
      confidence: 0.93,
      metadata: { people: 3 },
      idempotencyKey: 'demo:event-1',
    });

    expect(transaction.productivityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        cameraId: 'camera-1',
        zoneId: 'zone-1',
        eventType: 'TASK_DETECTED',
        durationSeconds: 90,
        confidence: 0.93,
        metadata: { people: 3 },
        source: 'DEMO',
        idempotencyKey: 'demo:event-1',
      }),
    });
    expect(transaction.productivityCamera.update).toHaveBeenCalledWith({
      where: { id: 'camera-1' },
      data: { status: 'ONLINE', lastHeartbeatAt: expect.any(Date) },
    });
    expect(result).toEqual({ event: { id: 'event-1' }, duplicate: false });
  });

  it('returns the persisted event for an idempotent retry without another transaction', async () => {
    prisma.productivityEvent.findFirst.mockResolvedValue({ id: 'existing-event' });

    const result = await service.createDemoEvent('tenant-1', {
      cameraId: 'camera-1',
      eventType: 'ACTIVITY_STARTED',
      startedAt: '2026-08-18T10:00:00.000Z',
      idempotencyKey: 'demo:existing-event',
    });

    expect(result).toEqual({ event: { id: 'existing-event' }, duplicate: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a camera outside the active tenant', async () => {
    prisma.productivityCamera.findFirst.mockResolvedValue(null);

    await expect(
      service.createDemoEvent('tenant-1', {
        cameraId: 'camera-from-another-tenant',
        eventType: 'ACTIVITY_STARTED',
        startedAt: '2026-08-18T10:00:00.000Z',
        idempotencyKey: 'demo:foreign-camera',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a zone that does not belong to the selected camera and branch', async () => {
    prisma.productivityZone.findFirst.mockResolvedValue(null);

    await expect(
      service.createDemoEvent('tenant-1', {
        cameraId: 'camera-1',
        zoneId: 'foreign-zone',
        eventType: 'ACTIVITY_STARTED',
        startedAt: '2026-08-18T10:00:00.000Z',
        idempotencyKey: 'demo:foreign-zone',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
