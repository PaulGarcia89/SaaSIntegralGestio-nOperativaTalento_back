import { InventoryAssetCondition, InventoryAssetStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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
