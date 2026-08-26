import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const describeDatabase = process.env.RUN_RESTAURANT_INVENTORY_E2E === '1' ? describe : describe.skip;

describeDatabase('Restaurant inventory idempotency persistence', () => {
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const records: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the isolated E2E suite');
    const databaseName = new URL(process.env.DATABASE_URL).pathname.toLowerCase();
    if (!/(e2e|test|certification)/.test(databaseName)) throw new Error('The E2E suite requires an isolated database');
    await prisma.$connect();
  });

  afterAll(async () => {
    if (records.length) await prisma.restaurantInventoryIdempotencyRecord.deleteMany({ where: { id: { in: records } } });
    await prisma.$disconnect();
  });

  it('persists a key per tenant/user/endpoint and rejects an exact duplicate at the database boundary', async () => {
    const first = await prisma.restaurantInventoryIdempotencyRecord.create({ data: { tenantId: `tenant-${suffix}`, userId: 'user-1', endpoint: '/receipts', method: 'POST', idempotencyKey: `key-${suffix}`, payloadHash: 'hash-a', responseJson: { id: 'receipt-1' } } });
    records.push(first.id);
    await expect(prisma.restaurantInventoryIdempotencyRecord.create({ data: { tenantId: `tenant-${suffix}`, userId: 'user-1', endpoint: '/receipts', method: 'POST', idempotencyKey: `key-${suffix}`, payloadHash: 'hash-a', responseJson: { id: 'receipt-2' } } })).rejects.toMatchObject({ code: 'P2002' });
    const isolatedTenantRecord = await prisma.restaurantInventoryIdempotencyRecord.create({ data: { tenantId: `other-tenant-${suffix}`, userId: 'user-1', endpoint: '/receipts', method: 'POST', idempotencyKey: `key-${suffix}`, payloadHash: 'hash-b', responseJson: { id: 'receipt-3' } } });
    records.push(isolatedTenantRecord.id);
  });
});
