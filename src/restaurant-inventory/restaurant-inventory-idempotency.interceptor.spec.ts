import { createHash } from 'crypto';
import { firstValueFrom, from, of } from 'rxjs';
import { RestaurantInventoryIdempotencyInterceptor } from './restaurant-inventory-idempotency.interceptor';

describe('RestaurantInventoryIdempotencyInterceptor', () => {
  const context = (request: any) => ({ switchToHttp: () => ({ getRequest: () => request }) }) as any;

  it('replays the exact persisted response for the same key and payload', async () => {
    const payloadHash = createHash('sha256').update(JSON.stringify({ body: {}, file: null, params: { id: '1' }, query: {} })).digest('hex');
    const existing = { payloadHash, responseJson: { id: 'receipt-1', status: 'CONFIRMED' } };
    const prisma: any = { restaurantInventoryIdempotencyRecord: { findUnique: jest.fn().mockResolvedValue(existing), create: jest.fn() } };
    const interceptor = new RestaurantInventoryIdempotencyInterceptor(prisma);
    const request = { method: 'POST', path: '/restaurant-inventory/receipts/1/confirm', route: { path: '/restaurant-inventory/receipts/:id/confirm' }, header: () => 'same-key', tenant: { id: 'tenant-1' }, user: { sub: 'user-1' }, params: { id: '1' }, query: {}, body: {} };
    const result = await firstValueFrom(interceptor.intercept(context(request), { handle: () => of({ id: 'new-result' }) } as any));
    expect(result).toEqual(existing.responseJson);
    expect(prisma.restaurantInventoryIdempotencyRecord.create).not.toHaveBeenCalled();
  });

  it('rejects a reused key when the payload hash differs', async () => {
    const prisma: any = { restaurantInventoryIdempotencyRecord: { findUnique: jest.fn().mockResolvedValue({ payloadHash: 'different', responseJson: {} }), create: jest.fn() } };
    const interceptor = new RestaurantInventoryIdempotencyInterceptor(prisma);
    const request = { method: 'POST', path: '/restaurant-inventory/receipts', route: { path: '/restaurant-inventory/receipts' }, header: () => 'same-key', tenant: { id: 'tenant-1' }, user: { sub: 'user-1' }, params: {}, query: {}, body: { quantity: 2 } };
    await expect(firstValueFrom(interceptor.intercept(context(request), { handle: () => of({}) } as any))).rejects.toThrow('different payload');
  });

  it('does not require a key for read requests', async () => {
    const prisma: any = { restaurantInventoryIdempotencyRecord: { findUnique: jest.fn(), create: jest.fn() } };
    const interceptor = new RestaurantInventoryIdempotencyInterceptor(prisma);
    const result = await firstValueFrom(interceptor.intercept(context({ method: 'GET', header: () => undefined, tenant: { id: 'tenant-1' }, user: { sub: 'user-1' } }), { handle: () => of({ ok: true }) } as any));
    expect(result).toEqual({ ok: true });
    expect(prisma.restaurantInventoryIdempotencyRecord.findUnique).not.toHaveBeenCalled();
  });

  it('uses x-request-id as a fallback for mutations without Idempotency-Key', async () => {
    const prisma: any = { restaurantInventoryIdempotencyRecord: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) } };
    const interceptor = new RestaurantInventoryIdempotencyInterceptor(prisma);
    const request = { method: 'POST', header: (name: string) => name === 'x-request-id' ? 'request-1' : undefined, tenant: { id: 'tenant-1' }, user: { sub: 'user-1' }, route: { path: '/restaurant-inventory/transfers' }, params: {}, query: {}, body: {} };
    await firstValueFrom(interceptor.intercept(context(request), { handle: () => of({ ok: true }) } as any));
    expect(prisma.restaurantInventoryIdempotencyRecord.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId_userId_method_endpoint_idempotencyKey: expect.objectContaining({ idempotencyKey: 'request-1' }) }) }));
  });

  it('shares one in-flight execution for concurrent requests with the same key', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const prisma: any = { restaurantInventoryIdempotencyRecord: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) } };
    const interceptor = new RestaurantInventoryIdempotencyInterceptor(prisma);
    const request = { method: 'POST', header: () => 'same-request', tenant: { id: 'tenant-1' }, user: { sub: 'user-1' }, route: { path: '/restaurant-inventory/adjustments' }, params: {}, query: {}, body: { quantity: 1 } };
    const handle = jest.fn(async () => { await gate; return { ok: true }; });
    const first = firstValueFrom(interceptor.intercept(context(request), { handle: () => from(handle()) } as any));
    const second = firstValueFrom(interceptor.intercept(context(request), { handle: () => from(handle()) } as any));
    await Promise.resolve();
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('uses a database advisory lock when transactions are available', async () => {
    const lock = jest.fn().mockResolvedValue([]);
    const payloadHash = createHash('sha256').update(JSON.stringify({ body: {}, file: null, params: {}, query: {} })).digest('hex');
    const tx = { $queryRaw: lock, restaurantInventoryIdempotencyRecord: { findUnique: jest.fn().mockResolvedValue({ payloadHash, responseJson: { ok: true } }) } };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)), restaurantInventoryIdempotencyRecord: tx.restaurantInventoryIdempotencyRecord };
    const interceptor = new RestaurantInventoryIdempotencyInterceptor(prisma);
    const request = { method: 'POST', header: () => 'distributed-key', tenant: { id: 'tenant-1' }, user: { sub: 'user-1' }, route: { path: '/restaurant-inventory/adjustments' }, params: {}, query: {}, body: {} };
    await expect(firstValueFrom(interceptor.intercept(context(request), { handle: () => of({ ok: false }) } as any))).resolves.toEqual({ ok: true });
    expect(lock).toHaveBeenCalledTimes(1);
  });
});
