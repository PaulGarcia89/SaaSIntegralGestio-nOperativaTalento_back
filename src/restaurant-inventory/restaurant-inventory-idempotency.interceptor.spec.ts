import { createHash } from 'crypto';
import { firstValueFrom, of } from 'rxjs';
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
});
