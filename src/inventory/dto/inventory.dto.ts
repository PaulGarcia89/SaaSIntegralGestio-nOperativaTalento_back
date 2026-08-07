import { InventoryAssetCondition, InventoryAssetStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, MinLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateInventoryItemDto {
  @IsString() @MinLength(2) @MaxLength(60) sku!: string;
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
}

export class CreateInventoryAssetDto {
  @IsUUID() itemId!: string;
  @IsUUID() branchId!: string;
  @IsString() @MinLength(2) @MaxLength(80) assetTag!: string;
  @IsOptional() @IsString() @MaxLength(120) serialNumber?: string;
  @IsOptional() @IsEnum(InventoryAssetCondition) condition?: InventoryAssetCondition;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class ListInventoryAssetsDto {
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsEnum(InventoryAssetStatus) status?: InventoryAssetStatus;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}

export class AssignInventoryAssetDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsUUID() workflowAssignmentId?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class InventoryOperationDto {
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsEnum(InventoryAssetCondition) condition?: InventoryAssetCondition;
}

export class TransferInventoryAssetDto extends InventoryOperationDto {
  @IsUUID() toBranchId!: string;
}

export class ValidateInventoryReturnDto extends InventoryOperationDto {
  @IsEnum(InventoryAssetStatus) status!: InventoryAssetStatus;
}

export class CreateInventoryLocationDto {
  @IsUUID() branchId!: string;
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(40) type?: string;
}

export class AdjustInventoryStockDto {
  @IsUUID() itemId!: string;
  @IsUUID() branchId!: string;
  @Type(() => Number) @IsInt() @Min(-1000000) @Max(1000000) quantity!: number;
  @IsOptional() @IsUUID() locationId?: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class CountInventoryStockDto {
  @IsUUID() itemId!: string;
  @IsUUID() branchId!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(1000000) countedQty!: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateInventoryStockPolicyDto {
  @IsUUID() itemId!: string;
  @IsUUID() branchId!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(1000000) minQty!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(1000000) reorderPoint!: number;
  @Type(() => Number) @IsOptional() @IsInt() @Min(0) @Max(1000000) maxQty?: number;
}

export class ListInventoryWarehouseDto {
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page?: number = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(100) pageSize?: number = 20;
}

export class CreateInventorySupplierDto { @IsString() @MinLength(2) @MaxLength(160) name!: string; @IsOptional() @IsString() @MaxLength(160) email?: string; @IsOptional() @IsString() @MaxLength(40) phone?: string; @IsOptional() @IsString() @MaxLength(60) taxId?: string; }
export class CreatePurchaseOrderDto { @IsUUID() branchId!: string; @IsUUID() supplierId!: string; @IsString() @MinLength(3) @MaxLength(24) code!: string; @IsOptional() @IsString() @MaxLength(3) currency?: string; @IsOptional() @Type(() => Number) @Min(0) budgetAmount?: number; @IsOptional() @IsString() @MaxLength(500) notes?: string; lines!: Array<{ itemId: string; quantity: number; unitCost: number }>; }
export class ReceivePurchaseOrderDto { lines!: Array<{ lineId: string; quantity: number }>; }
export class CreateInventoryMaintenanceDto { @IsUUID() assetId!: string; @IsString() @MinLength(3) @MaxLength(160) title!: string; @IsString() @MinLength(3) @MaxLength(30) type!: string; @IsOptional() @IsString() @MaxLength(1000) description?: string; @IsOptional() @IsString() dueAt?: string; @IsOptional() @Type(() => Number) @Min(0) costAmount?: number; @IsOptional() @IsString() @MaxLength(3) currency?: string; @IsOptional() @IsString() @MaxLength(160) vendor?: string; }
export class ResolveInventoryMaintenanceDto { @IsOptional() @Type(() => Number) @Min(0) costAmount?: number; @IsOptional() @IsString() @MaxLength(500) notes?: string; }
