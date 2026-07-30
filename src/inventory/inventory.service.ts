import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryAssetStatus, InventoryEvidenceType, InventoryMovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { TrainingAntivirusService } from '../training/training-antivirus.service';
import { AssignInventoryAssetDto, CreateInventoryAssetDto, CreateInventoryItemDto, InventoryOperationDto, ListInventoryAssetsDto, TransferInventoryAssetDto, ValidateInventoryReturnDto } from './dto/inventory.dto';
import { InventoryEvidenceStorageService } from './inventory-evidence-storage.service';

const assetInclude = {
  item: true, branch: true, employee: true,
  evidences: { select: { id: true, type: true, originalName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true } },
} satisfies Prisma.InventoryAssetInclude;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService, private readonly storage: InventoryEvidenceStorageService, private readonly antivirus: TrainingAntivirusService) {}

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

  async getAsset(tenantId: string, id: string) {
    const asset = await this.prisma.inventoryAsset.findFirst({ where: { id, tenantId }, include: { ...assetInclude, movements: { include: { fromBranch: true, toBranch: true, employee: true, evidences: { select: { id: true, type: true, originalName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true } } }, orderBy: { occurredAt: 'desc' } } } });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  async createAsset(tenantId: string, actorUserId: string, dto: CreateInventoryAssetDto, requestId?: string) {
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
