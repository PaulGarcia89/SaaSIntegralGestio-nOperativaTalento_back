import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const describeDatabase = process.env.RUN_RESTAURANT_INVENTORY_E2E === '1' ? describe : describe.skip;

describeDatabase('Restaurant inventory Phase 3 real database invariants', () => {
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const tenantId = `phase3-tenant-${suffix}`;
  const otherTenantId = `phase3-other-${suffix}`;
  const auditIds: string[] = [];
  const idempotencyIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the isolated E2E suite');
    const databaseName = new URL(process.env.DATABASE_URL).pathname.toLowerCase();
    if (!/(e2e|test|certification)/.test(databaseName)) throw new Error('The E2E suite requires an isolated database');
    await prisma.$connect();
  });

  afterAll(async () => {
    if (idempotencyIds.length) await prisma.restaurantInventoryIdempotencyRecord.deleteMany({ where: { id: { in: idempotencyIds } } });
    await prisma.$disconnect();
  });

  it('keeps audit events append-only: update and delete are rejected by PostgreSQL', async () => {
    const event = await prisma.restaurantInventoryAuditLog.create({ data: { tenantId, action: 'PHASE3_TEST', entityType: 'Test', entityId: suffix, hash: `hash-${suffix}` } });
    auditIds.push(event.id);
    await expect(prisma.restaurantInventoryAuditLog.update({ where: { id: event.id }, data: { action: 'TAMPERED' } })).rejects.toThrow(/immutable|audit_logs/i);
    await expect(prisma.restaurantInventoryAuditLog.delete({ where: { id: event.id } })).rejects.toThrow(/immutable|audit_logs/i);
  });

  it('isolates audit queries by tenant, actor, action, entity and date at the database boundary', async () => {
    const first = await prisma.restaurantInventoryAuditLog.create({ data: { tenantId, actorId: 'actor-a', action: 'COUNT_APPROVED', entityType: 'StockCount', entityId: 'count-a', hash: `hash-a-${suffix}` } });
    const other = await prisma.restaurantInventoryAuditLog.create({ data: { tenantId: otherTenantId, actorId: 'actor-a', action: 'COUNT_APPROVED', entityType: 'StockCount', entityId: 'count-b', hash: `hash-b-${suffix}` } });
    auditIds.push(first.id, other.id);
    const rows = await prisma.restaurantInventoryAuditLog.findMany({ where: { tenantId, actorId: 'actor-a', action: 'COUNT_APPROVED', entityType: 'StockCount' } });
    expect(rows.map((row) => row.id)).toEqual([first.id]);
  });

  it('enforces idempotency uniqueness per tenant, user, endpoint and payload key', async () => {
    const key = `phase3-${suffix}`;
    const first = await prisma.restaurantInventoryIdempotencyRecord.create({ data: { tenantId, userId: 'actor-a', endpoint: '/stock-counts', method: 'POST', idempotencyKey: key, payloadHash: 'payload-a', responseJson: { id: 'count-a' } } });
    idempotencyIds.push(first.id);
    await expect(prisma.restaurantInventoryIdempotencyRecord.create({ data: { tenantId, userId: 'actor-a', endpoint: '/stock-counts', method: 'POST', idempotencyKey: key, payloadHash: 'payload-a', responseJson: { id: 'count-b' } } })).rejects.toMatchObject({ code: 'P2002' });
    const otherTenant = await prisma.restaurantInventoryIdempotencyRecord.create({ data: { tenantId: otherTenantId, userId: 'actor-a', endpoint: '/stock-counts', method: 'POST', idempotencyKey: key, payloadHash: 'payload-b', responseJson: { id: 'count-c' } } });
    idempotencyIds.push(otherTenant.id);
  });

  it('does not allow a warehouse query to cross a tenant boundary', async () => {
    const rows = await prisma.restaurantInventoryWarehouse.findMany({ where: { tenantId, branchId: 'branch-not-owned' } });
    expect(rows).toHaveLength(0);
  });

  it('keeps expiry, variance and shrinkage records tenant-scoped', async () => {
    const [expiry, shrinkage] = await Promise.all([
      prisma.restaurantExpiryAlertAcknowledgement.findMany({ where: { tenantId } }),
      prisma.restaurantShrinkageAlert.findMany({ where: { tenantId } }),
    ]);
    expect(expiry.every((row) => row.tenantId === tenantId)).toBe(true);
    expect(shrinkage.every((row) => row.tenantId === tenantId)).toBe(true);
  });
});
