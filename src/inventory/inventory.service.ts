import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryAssetStatus, InventoryEvidenceType, InventoryMovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { TrainingAntivirusService } from '../training/training-antivirus.service';
import { AdjustInventoryStockDto, AssignInventoryAssetDto, CountInventoryStockDto, CreateInventoryAssetDto, CreateInventoryItemDto, CreateInventoryLocationDto, CreateInventoryMaintenanceDto, CreateInventorySupplierDto, CreatePurchaseOrderDto, InventoryOperationDto, ListInventoryAssetsDto, ListInventoryWarehouseDto, ReceivePurchaseOrderDto, ResolveInventoryMaintenanceDto, TransferInventoryAssetDto, UpdateInventoryStockPolicyDto, ValidateInventoryReturnDto } from './dto/inventory.dto';
import { InventoryEvidenceStorageService } from './inventory-evidence-storage.service';
import { PlanLimitsService } from '../plan-limits/plan-limits.service';

const assetInclude = {
  item: true, branch: true, employee: true,
  evidences: { select: { id: true, type: true, originalName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true } },
} satisfies Prisma.InventoryAssetInclude;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService, private readonly storage: InventoryEvidenceStorageService, private readonly antivirus: TrainingAntivirusService, private readonly planLimits: PlanLimitsService) {}

  listItems(tenantId: string) {
    return this.prisma.inventoryItem.findMany({ where: { tenantId }, include: { _count: { select: { assets: true } } }, orderBy: { name: 'asc' } });
  }

  async context(tenantId: string) {
    const [branches, employees, workflowAssignments] = await Promise.all([
      this.prisma.branch.findMany({ where: { tenantId }, select: { id: true, name: true, location: true }, orderBy: { name: 'asc' } }),
      this.prisma.employee.findMany({ where: { tenantId, status: 'ACTIVE' }, select: { id: true, name: true, email: true, jobTitle: true, branchAssignments: { where: { releasedAt: null }, select: { branchId: true, isPrimary: true } } }, orderBy: { name: 'asc' } }),
      this.prisma.inventoryAssignment.findMany({ where: { tenantId, status: 'PENDING' }, select: { id: true, employeeId: true, branchId: true, dueDate: true, metadata: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    return { branches, employees, workflowAssignments };
  }

  createItem(tenantId: string, dto: CreateInventoryItemDto) {
    return this.prisma.inventoryItem.create({ data: { tenantId, sku: dto.sku.trim().toUpperCase(), name: dto.name.trim() } }).catch(() => { throw new ConflictException('The SKU already exists'); });
  }

  listAssets(tenantId: string, query: ListInventoryAssetsDto) {
    return this.prisma.inventoryAsset.findMany({
      where: { tenantId, branchId: query.branchId, employeeId: query.employeeId, status: query.status,
        OR: query.search ? [{ assetTag: { contains: query.search, mode: 'insensitive' } }, { serialNumber: { contains: query.search, mode: 'insensitive' } }, { item: { name: { contains: query.search, mode: 'insensitive' } } }] : undefined },
      include: assetInclude, orderBy: { updatedAt: 'desc' },
    });
  }

  async listMyAssets(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { email: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const employee = await this.prisma.employee.findFirst({ where: { tenantId, email: { equals: user.email, mode: 'insensitive' } }, select: { id: true } });
    if (!employee) return [];
    return this.prisma.inventoryAsset.findMany({ where: { tenantId, employeeId: employee.id, status: { in: [InventoryAssetStatus.RESERVED, InventoryAssetStatus.ASSIGNED, InventoryAssetStatus.RETURN_PENDING] } }, include: assetInclude, orderBy: { updatedAt: 'desc' } });
  }

  async analytics(tenantId: string, branchId?: string) {
    const assetWhere = { tenantId, branchId };
    const stockWhere = { tenantId, branchId };
    const [assets, stocks, openMaintenance, orders] = await Promise.all([
      this.prisma.inventoryAsset.groupBy({ by: ['status'], where: assetWhere, _count: { _all: true } }),
      this.prisma.inventoryStock.findMany({ where: stockWhere, select: { qtyLocal: true, minQty: true, reorderPoint: true } }),
      this.prisma.inventoryMaintenanceTicket.count({ where: { tenantId, status: 'OPEN' } }),
      this.prisma.inventoryPurchaseOrder.count({ where: { tenantId, branchId, status: { in: ['DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED'] } } }),
    ]);
    const byStatus = Object.fromEntries(assets.map(item => [item.status, item._count._all]));
    const reorder = stocks.filter(stock => stock.qtyLocal <= stock.reorderPoint).length;
    const belowMinimum = stocks.filter(stock => stock.qtyLocal < stock.minQty).length;
    return { assets: { total: assets.reduce((sum, item) => sum + item._count._all, 0), available: byStatus.AVAILABLE ?? 0, assigned: byStatus.ASSIGNED ?? 0, maintenance: byStatus.MAINTENANCE ?? 0, returnPending: byStatus.RETURN_PENDING ?? 0 }, stock: { references: stocks.length, reorder, belowMinimum }, operations: { openMaintenance, purchaseOrdersInProgress: orders } };
  }

  async auditTrail(tenantId: string, branchId?: string, page = 1, pageSize = 25) {
    const where = { tenantId, branchId, action: { startsWith: 'INVENTORY_' } };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, action: true, email: true, actorRole: true, route: true, statusCode: true, createdAt: true, correlationId: true } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async getAsset(tenantId: string, id: string) {
    const asset = await this.prisma.inventoryAsset.findFirst({ where: { id, tenantId }, include: { ...assetInclude, movements: { include: { fromBranch: true, toBranch: true, employee: true, evidences: { select: { id: true, type: true, originalName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true } } }, orderBy: { occurredAt: 'desc' } } } });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  async findAssetByTag(tenantId: string, assetTag: string) {
    const asset = await this.prisma.inventoryAsset.findFirst({ where: { tenantId, assetTag: assetTag.trim().toUpperCase() }, include: assetInclude });
    if (!asset) throw new NotFoundException('Activo no encontrado');
    return asset;
  }

  async createAsset(tenantId: string, actorUserId: string, dto: CreateInventoryAssetDto, requestId?: string) {
    await this.planLimits.assertCapacity(tenantId, 'maxAssets');
    await this.assertCatalogAndBranch(tenantId, dto.itemId, dto.branchId);
    return this.prisma.$transaction(async tx => {
      const asset = await tx.inventoryAsset.create({ data: { tenantId, itemId: dto.itemId, branchId: dto.branchId, assetTag: dto.assetTag.trim().toUpperCase(), serialNumber: dto.serialNumber?.trim() || null, condition: dto.condition, notes: dto.notes } });
      await tx.inventoryMovement.create({ data: { tenantId, assetId: asset.id, type: InventoryMovementType.REGISTERED, toBranchId: dto.branchId, actorUserId, condition: asset.condition, notes: dto.notes, requestId } });
      await tx.inventoryItem.update({ where: { id: dto.itemId }, data: { qtyGlobal: { increment: 1 } } });
      await tx.inventoryStock.upsert({ where: { itemId_branchId: { itemId: dto.itemId, branchId: dto.branchId } }, create: { tenantId, itemId: dto.itemId, branchId: dto.branchId, qtyLocal: 1 }, update: { qtyLocal: { increment: 1 } } });
      return tx.inventoryAsset.findUniqueOrThrow({ where: { id: asset.id }, include: assetInclude });
    }).catch(error => { if ((error as { code?: string }).code === 'P2002') throw new ConflictException('Asset tag or serial number already exists'); throw error; });
  }

  async assign(tenantId: string, id: string, actorUserId: string, dto: AssignInventoryAssetDto, requestId?: string) {
    const asset = await this.requireAsset(tenantId, id);
    if (asset.status !== InventoryAssetStatus.AVAILABLE) throw new ConflictException('Only available assets can be assigned');
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, tenantId }, include: { branchAssignments: { where: { releasedAt: null } } } });
    if (!employee) throw new NotFoundException('Employee not found');
    if (!employee.branchAssignments.some(branch => branch.branchId === asset.branchId)) throw new BadRequestException('Employee is outside the asset branch');
    if (dto.workflowAssignmentId) {
      const workflow = await this.prisma.inventoryAssignment.findFirst({ where: { id: dto.workflowAssignmentId, tenantId, employeeId: dto.employeeId } });
      if (!workflow) throw new BadRequestException('Workflow inventory assignment is invalid');
    }
    return this.prisma.$transaction(async tx => {
      const updated = await tx.inventoryAsset.update({ where: { id }, data: { employeeId: dto.employeeId, workflowAssignmentId: dto.workflowAssignmentId, status: InventoryAssetStatus.RESERVED, assignedAt: new Date() } });
      await tx.inventoryMovement.create({ data: { tenantId, assetId: id, type: InventoryMovementType.ASSIGNED, fromBranchId: asset.branchId, toBranchId: asset.branchId, employeeId: dto.employeeId, actorUserId, notes: dto.notes, requestId } });
      const flow = await tx.onboardingFlow.findFirst({ where: { tenantId, employeeId: dto.employeeId, status: { not: 'COMPLETED' } }, orderBy: { createdAt: 'desc' } });
      if (flow) await tx.onboardingTask.upsert({
        where: { onboardingFlowId_taskKey: { onboardingFlowId: flow.id, taskKey: 'asset-delivery' } },
        create: { tenantId, branchId: asset.branchId, workflowId: flow.workflowId, onboardingFlowId: flow.id, employeeId: dto.employeeId, taskType: 'ASSET_DELIVERY', title: 'Entrega de equipo de trabajo', taskKey: 'asset-delivery', description: `Entregar ${asset.assetTag} y registrar evidencia de custodia.`, status: 'PENDING', ownerType: 'INVENTORY' },
        update: { description: `Entregar ${asset.assetTag} y registrar evidencia de custodia.`, status: 'PENDING', completedAt: null, progressPercent: 0 },
      });
      return updated;
    });
  }

  deliver(tenantId: string, id: string, actorUserId: string, dto: InventoryOperationDto, file?: Express.Multer.File, requestId?: string) {
    return this.withEvidence(tenantId, id, actorUserId, InventoryEvidenceType.DELIVERY, InventoryMovementType.DELIVERED, dto, file, requestId, [InventoryAssetStatus.RESERVED], { status: InventoryAssetStatus.ASSIGNED, deliveredAt: new Date() });
  }

  async transfer(tenantId: string, id: string, actorUserId: string, dto: TransferInventoryAssetDto, file?: Express.Multer.File, requestId?: string) {
    const asset = await this.requireAsset(tenantId, id);
    if (asset.employeeId || asset.status !== InventoryAssetStatus.AVAILABLE) throw new ConflictException('Assigned or unavailable assets must be returned before transfer');
    await this.assertBranch(tenantId, dto.toBranchId);
    if (dto.toBranchId === asset.branchId) throw new BadRequestException('Destination branch must be different');
    return this.withEvidence(tenantId, id, actorUserId, InventoryEvidenceType.TRANSFER, InventoryMovementType.TRANSFERRED, dto, file, requestId, [InventoryAssetStatus.AVAILABLE], { branchId: dto.toBranchId }, dto.toBranchId);
  }

  requestReturn(tenantId: string, id: string, actorUserId: string, dto: InventoryOperationDto, requestId?: string) {
    return this.simpleTransition(tenantId, id, actorUserId, InventoryMovementType.RETURN_REQUESTED, dto, [InventoryAssetStatus.ASSIGNED], { status: InventoryAssetStatus.RETURN_PENDING, returnRequestedAt: new Date() }, requestId);
  }

  returnAsset(tenantId: string, id: string, actorUserId: string, dto: InventoryOperationDto, file?: Express.Multer.File, requestId?: string) {
    return this.withEvidence(tenantId, id, actorUserId, InventoryEvidenceType.RETURN, InventoryMovementType.RETURNED, dto, file, requestId, [InventoryAssetStatus.ASSIGNED, InventoryAssetStatus.RETURN_PENDING], { status: InventoryAssetStatus.RETURN_PENDING, returnedAt: new Date(), condition: dto.condition });
  }

  async validateReturn(tenantId: string, id: string, actorUserId: string, dto: ValidateInventoryReturnDto, file?: Express.Multer.File, requestId?: string) {
    const validStatuses: InventoryAssetStatus[] = [InventoryAssetStatus.AVAILABLE, InventoryAssetStatus.MAINTENANCE, InventoryAssetStatus.RETIRED];
    if (!validStatuses.includes(dto.status)) throw new BadRequestException('Invalid status after return validation');
    return this.withEvidence(tenantId, id, actorUserId, InventoryEvidenceType.VALIDATION, InventoryMovementType.RETURN_VALIDATED, dto, file, requestId, [InventoryAssetStatus.RETURN_PENDING], { status: dto.status, employeeId: null, workflowAssignmentId: null, condition: dto.condition });
  }

  async evidence(tenantId: string, evidenceId: string) {
    const evidence = await this.prisma.inventoryEvidence.findFirst({ where: { id: evidenceId, tenantId } });
    if (!evidence) throw new NotFoundException('Evidence not found');
    return { evidence, buffer: await this.storage.read(evidence.storageKey) };
  }

  listLocations(tenantId: string, branchId?: string) { return this.prisma.inventoryLocation.findMany({ where: { tenantId, branchId, isActive: true }, orderBy: [{ branchId: 'asc' }, { name: 'asc' }] }); }
  async createLocation(tenantId: string, dto: CreateInventoryLocationDto) { await this.assertBranch(tenantId, dto.branchId); return this.prisma.inventoryLocation.create({ data: { tenantId, branchId: dto.branchId, code: dto.code.trim().toUpperCase(), name: dto.name.trim(), type: dto.type?.trim().toUpperCase() || 'STORAGE' } }); }

  async warehouse(tenantId: string, query: ListInventoryWarehouseDto) {
    const page = query.page ?? 1; const pageSize = query.pageSize ?? 20;
    const where: Prisma.InventoryStockWhereInput = { tenantId, branchId: query.branchId, ...(query.search ? { item: { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { sku: { contains: query.search, mode: 'insensitive' } }] } } : {}) };
    const [items, total] = await this.prisma.$transaction([this.prisma.inventoryStock.findMany({ where, include: { item: true, branch: true }, orderBy: [{ qtyLocal: 'asc' }, { updatedAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }), this.prisma.inventoryStock.count({ where })]);
    return { items: items.map((stock) => ({ ...stock, needsReorder: stock.qtyLocal <= stock.reorderPoint, belowMinimum: stock.qtyLocal < stock.minQty })), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async adjustStock(tenantId: string, actorUserId: string, dto: AdjustInventoryStockDto) {
    await this.assertCatalogAndBranch(tenantId, dto.itemId, dto.branchId);
    if (dto.locationId) { const location = await this.prisma.inventoryLocation.findFirst({ where: { id: dto.locationId, tenantId, branchId: dto.branchId, isActive: true } }); if (!location) throw new BadRequestException('Ubicación de inventario inválida'); }
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.inventoryStock.findUnique({ where: { itemId_branchId: { itemId: dto.itemId, branchId: dto.branchId } } });
      const balance = (current?.qtyLocal ?? 0) + dto.quantity; if (balance < 0) throw new BadRequestException('El ajuste dejaría el stock en negativo');
      const stock = await tx.inventoryStock.upsert({ where: { itemId_branchId: { itemId: dto.itemId, branchId: dto.branchId } }, create: { tenantId, itemId: dto.itemId, branchId: dto.branchId, qtyLocal: balance }, update: { qtyLocal: balance } });
      await tx.inventoryItem.update({ where: { id: dto.itemId }, data: { qtyGlobal: { increment: dto.quantity } } });
      await tx.inventoryStockMovement.create({ data: { tenantId, itemId: dto.itemId, branchId: dto.branchId, locationId: dto.locationId, type: 'ADJUSTMENT', quantity: dto.quantity, balanceAfter: balance, reason: dto.reason, actorUserId } });
      return stock;
    });
  }

  async countStock(tenantId: string, actorUserId: string, dto: CountInventoryStockDto) {
    await this.assertCatalogAndBranch(tenantId, dto.itemId, dto.branchId);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.inventoryStock.findUnique({ where: { itemId_branchId: { itemId: dto.itemId, branchId: dto.branchId } } });
      const expectedQty = current?.qtyLocal ?? 0;
      const variance = dto.countedQty - expectedQty;
      const count = await tx.inventoryStockCount.create({ data: { tenantId, itemId: dto.itemId, branchId: dto.branchId, expectedQty, countedQty: dto.countedQty, variance, notes: dto.notes, countedById: actorUserId } });
      if (variance) {
        await tx.inventoryStock.upsert({ where: { itemId_branchId: { itemId: dto.itemId, branchId: dto.branchId } }, create: { tenantId, itemId: dto.itemId, branchId: dto.branchId, qtyLocal: dto.countedQty }, update: { qtyLocal: dto.countedQty } });
        await tx.inventoryItem.update({ where: { id: dto.itemId }, data: { qtyGlobal: { increment: variance } } });
        await tx.inventoryStockMovement.create({ data: { tenantId, itemId: dto.itemId, branchId: dto.branchId, type: 'COUNT_RECONCILIATION', quantity: variance, balanceAfter: dto.countedQty, reason: `Conciliación de conteo ${count.id}`, actorUserId } });
      }
      return count;
    });
  }

  async updateStockPolicy(tenantId: string, dto: UpdateInventoryStockPolicyDto) {
    await this.assertCatalogAndBranch(tenantId, dto.itemId, dto.branchId);
    if (dto.maxQty !== undefined && dto.maxQty < dto.reorderPoint) throw new BadRequestException('El máximo no puede ser menor que el punto de reposición');
    return this.prisma.inventoryStock.upsert({
      where: { itemId_branchId: { itemId: dto.itemId, branchId: dto.branchId } },
      create: { tenantId, itemId: dto.itemId, branchId: dto.branchId, qtyLocal: 0, minQty: dto.minQty, reorderPoint: dto.reorderPoint, maxQty: dto.maxQty },
      update: { minQty: dto.minQty, reorderPoint: dto.reorderPoint, maxQty: dto.maxQty },
    });
  }

  async exportMovements(tenantId: string, branchId?: string) { return this.prisma.inventoryStockMovement.findMany({ where: { tenantId, branchId }, orderBy: { occurredAt: 'desc' }, take: 10000 }); }

  listSuppliers(tenantId: string) { return this.prisma.inventorySupplier.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } }); }
  createSupplier(tenantId: string, dto: CreateInventorySupplierDto) { return this.prisma.inventorySupplier.create({ data: { tenantId, name: dto.name.trim(), email: dto.email?.trim(), phone: dto.phone?.trim(), taxId: dto.taxId?.trim() } }); }
  listPurchaseOrders(tenantId: string, branchId?: string) { return this.prisma.inventoryPurchaseOrder.findMany({ where: { tenantId, branchId }, include: { lines: true }, orderBy: { createdAt: 'desc' } }); }
  async createPurchaseOrder(tenantId: string, actorUserId: string, dto: CreatePurchaseOrderDto) {
    await this.assertBranch(tenantId, dto.branchId);
    if (!dto.lines?.length) throw new BadRequestException('La orden debe contener al menos una línea');
    const supplier = await this.prisma.inventorySupplier.findFirst({ where: { id: dto.supplierId, tenantId, isActive: true } }); if (!supplier) throw new BadRequestException('Proveedor inválido');
    for (const line of dto.lines) { await this.assertCatalogAndBranch(tenantId, line.itemId, dto.branchId); if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.unitCost < 0) throw new BadRequestException('Línea de compra inválida'); }
    const total = dto.lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
    if (dto.budgetAmount !== undefined && total > dto.budgetAmount) throw new BadRequestException('La orden supera el presupuesto declarado');
    return this.prisma.inventoryPurchaseOrder.create({ data: { tenantId, branchId: dto.branchId, supplierId: dto.supplierId, code: dto.code.trim().toUpperCase(), currency: dto.currency?.toUpperCase() || 'USD', budgetAmount: dto.budgetAmount, totalAmount: total, notes: dto.notes, requestedById: actorUserId, lines: { create: dto.lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity, unitCost: line.unitCost })) } }, include: { lines: true } });
  }
  async approvePurchaseOrder(tenantId: string, id: string, actorUserId: string) { const order = await this.prisma.inventoryPurchaseOrder.findFirst({ where: { id, tenantId } }); if (!order) throw new NotFoundException('Orden no encontrada'); if (order.status !== 'DRAFT') throw new ConflictException('Solo se pueden aprobar borradores'); return this.prisma.inventoryPurchaseOrder.update({ where: { id }, data: { status: 'APPROVED', approvedById: actorUserId, approvedAt: new Date() }, include: { lines: true } }); }
  async receivePurchaseOrder(tenantId: string, id: string, actorUserId: string, dto: ReceivePurchaseOrderDto) { const order = await this.prisma.inventoryPurchaseOrder.findFirst({ where: { id, tenantId }, include: { lines: true } }); if (!order) throw new NotFoundException('Orden no encontrada'); if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status)) throw new ConflictException('La orden debe estar aprobada'); return this.prisma.$transaction(async tx => { for (const receipt of dto.lines) { const line = order.lines.find(item => item.id === receipt.lineId); if (!line || !Number.isInteger(receipt.quantity) || receipt.quantity < 1 || line.receivedQty + receipt.quantity > line.quantity) throw new BadRequestException('Recepción inválida'); const balance = (await tx.inventoryStock.findUnique({ where: { itemId_branchId: { itemId: line.itemId, branchId: order.branchId } } }))?.qtyLocal ?? 0; await tx.inventoryPurchaseOrderLine.update({ where: { id: line.id }, data: { receivedQty: { increment: receipt.quantity } } }); await tx.inventoryStock.upsert({ where: { itemId_branchId: { itemId: line.itemId, branchId: order.branchId } }, create: { tenantId, itemId: line.itemId, branchId: order.branchId, qtyLocal: balance + receipt.quantity }, update: { qtyLocal: balance + receipt.quantity } }); await tx.inventoryItem.update({ where: { id: line.itemId }, data: { qtyGlobal: { increment: receipt.quantity } } }); await tx.inventoryStockMovement.create({ data: { tenantId, itemId: line.itemId, branchId: order.branchId, type: 'PURCHASE_RECEIPT', quantity: receipt.quantity, balanceAfter: balance + receipt.quantity, reason: `Recepción ${order.code}`, actorUserId } }); } const fresh = await tx.inventoryPurchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } }); const complete = fresh.lines.every(line => line.receivedQty >= line.quantity); return tx.inventoryPurchaseOrder.update({ where: { id }, data: { status: complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED', receivedAt: complete ? new Date() : undefined }, include: { lines: true } }); }); }
  listMaintenance(tenantId: string) { return this.prisma.inventoryMaintenanceTicket.findMany({ where: { tenantId }, include: { asset: { include: { item: true, branch: true } } }, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }] }); }
  async createMaintenance(tenantId: string, actorUserId: string, dto: CreateInventoryMaintenanceDto) { const asset = await this.requireAsset(tenantId, dto.assetId); return this.prisma.$transaction(async tx => { const ticket = await tx.inventoryMaintenanceTicket.create({ data: { tenantId, assetId: asset.id, type: dto.type.trim().toUpperCase(), title: dto.title.trim(), description: dto.description, dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined, costAmount: dto.costAmount, currency: dto.currency?.toUpperCase() || 'USD', vendor: dto.vendor, createdById: actorUserId } }); await tx.inventoryAsset.update({ where: { id: asset.id }, data: { status: InventoryAssetStatus.MAINTENANCE } }); await tx.inventoryMovement.create({ data: { tenantId, assetId: asset.id, type: InventoryMovementType.SENT_TO_MAINTENANCE, fromBranchId: asset.branchId, toBranchId: asset.branchId, actorUserId, notes: dto.title } }); return ticket; }); }
  async resolveMaintenance(tenantId: string, id: string, actorUserId: string, dto: ResolveInventoryMaintenanceDto) { const ticket = await this.prisma.inventoryMaintenanceTicket.findFirst({ where: { id, tenantId } }); if (!ticket || ticket.status !== 'OPEN') throw new NotFoundException('Mantenimiento abierto no encontrado'); return this.prisma.$transaction(async tx => { const updated = await tx.inventoryMaintenanceTicket.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedById: actorUserId, costAmount: dto.costAmount ?? ticket.costAmount, description: dto.notes ? `${ticket.description ?? ''}\n${dto.notes}`.trim() : ticket.description } }); await tx.inventoryAsset.update({ where: { id: ticket.assetId }, data: { status: InventoryAssetStatus.AVAILABLE } }); return updated; }); }

  private async simpleTransition(tenantId: string, id: string, actorUserId: string, type: InventoryMovementType, dto: InventoryOperationDto, allowed: InventoryAssetStatus[], data: Prisma.InventoryAssetUncheckedUpdateInput, requestId?: string) {
    const asset = await this.requireAsset(tenantId, id);
    if (!allowed.includes(asset.status)) throw new ConflictException(`Asset cannot perform this operation from ${asset.status}`);
    return this.prisma.$transaction(async tx => {
      const updated = await tx.inventoryAsset.update({ where: { id }, data });
      await tx.inventoryMovement.create({ data: { tenantId, assetId: id, type, fromBranchId: asset.branchId, toBranchId: asset.branchId, employeeId: asset.employeeId, actorUserId, condition: dto.condition, notes: dto.notes, requestId } });
      return updated;
    });
  }

  private async withEvidence(tenantId: string, id: string, actorUserId: string, evidenceType: InventoryEvidenceType, movementType: InventoryMovementType, dto: InventoryOperationDto, file: Express.Multer.File | undefined, requestId: string | undefined, allowed: InventoryAssetStatus[], data: Prisma.InventoryAssetUncheckedUpdateInput, toBranchId?: string) {
    const asset = await this.requireAsset(tenantId, id);
    if (!allowed.includes(asset.status)) throw new ConflictException(`Asset cannot perform this operation from ${asset.status}`);
    let stored: { storageKey: string; sha256: string } | undefined;
    if (file) { await this.antivirus.scan(file.buffer); stored = await this.storage.save(tenantId, file); }
    return this.prisma.$transaction(async tx => {
      const updated = await tx.inventoryAsset.update({ where: { id }, data });
      const movement = await tx.inventoryMovement.create({ data: { tenantId, assetId: id, type: movementType, fromBranchId: asset.branchId, toBranchId: toBranchId ?? asset.branchId, employeeId: asset.employeeId, actorUserId, condition: dto.condition, notes: dto.notes, requestId } });
      if (stored && file) await tx.inventoryEvidence.create({ data: { tenantId, assetId: id, movementId: movement.id, type: evidenceType, storageKey: stored.storageKey, originalName: file.originalname, mimeType: file.mimetype, sizeBytes: file.size, sha256: stored.sha256, uploadedBy: actorUserId } });
      if (movementType === InventoryMovementType.TRANSFERRED && toBranchId) {
        await tx.inventoryStock.update({ where: { itemId_branchId: { itemId: asset.itemId, branchId: asset.branchId } }, data: { qtyLocal: { decrement: 1 } } });
        await tx.inventoryStock.upsert({ where: { itemId_branchId: { itemId: asset.itemId, branchId: toBranchId } }, create: { tenantId, itemId: asset.itemId, branchId: toBranchId, qtyLocal: 1 }, update: { qtyLocal: { increment: 1 } } });
      }
      if (movementType === InventoryMovementType.DELIVERED && asset.workflowAssignmentId) await tx.inventoryAssignment.update({ where: { id: asset.workflowAssignmentId }, data: { status: 'ASSIGNED', assignedAt: new Date(), itemId: asset.itemId } });
      if (movementType === InventoryMovementType.DELIVERED && asset.employeeId) {
        const flow = await tx.onboardingFlow.findFirst({ where: { tenantId, employeeId: asset.employeeId, status: { not: 'COMPLETED' } }, orderBy: { createdAt: 'desc' } });
        if (flow) await tx.onboardingTask.updateMany({ where: { onboardingFlowId: flow.id, taskKey: 'asset-delivery' }, data: { status: 'COMPLETED', progressPercent: 100, completedAt: new Date(), blockingReason: null } });
      }
      return updated;
    });
  }

  private async requireAsset(tenantId: string, id: string) {
    const asset = await this.prisma.inventoryAsset.findFirst({ where: { id, tenantId } });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }
  private async assertCatalogAndBranch(tenantId: string, itemId: string, branchId: string) { await Promise.all([this.prisma.inventoryItem.findFirstOrThrow({ where: { id: itemId, tenantId } }), this.assertBranch(tenantId, branchId)]); }
  private async assertBranch(tenantId: string, branchId: string) { if (!await this.prisma.branch.findFirst({ where: { id: branchId, tenantId } })) throw new NotFoundException('Branch not found'); }
}
