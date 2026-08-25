import { IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { RestaurantInventoryStatus, RestaurantInventoryUnitType, RestaurantRecipeComponentType, RestaurantRecipeQuantityMode, RestaurantRecipeType, RestaurantShift, RestaurantStockPolicy } from '@prisma/client';

export class InventoryListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(RestaurantInventoryStatus) status?: RestaurantInventoryStatus;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: 'asc' | 'desc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class CreateCategoryDto { @IsString() name!: string; @IsOptional() @IsString() description?: string; }
export class UpdateCategoryDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsString() description?: string; }
export class CreateUnitDto { @IsString() name!: string; @IsString() abbreviation!: string; @IsEnum(RestaurantInventoryUnitType) type!: RestaurantInventoryUnitType; @IsOptional() @IsUUID() baseUnitId?: string; @IsNumber() @Min(0.000001) conversionFactor!: number; @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(12) decimalPrecision?: number; }
export class UpdateUnitDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsString() abbreviation?: string; @IsOptional() @IsEnum(RestaurantInventoryUnitType) type?: RestaurantInventoryUnitType; @IsOptional() @IsUUID() baseUnitId?: string; @IsOptional() @IsNumber() @Min(0.000001) conversionFactor?: number; @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(12) decimalPrecision?: number; }
export class CreateBranchDto { @IsString() name!: string; @IsString() location!: string; }
export class UpdateBranchDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsString() location?: string; }
export class CreateWarehouseDto { @IsUUID() branchId!: string; @IsString() name!: string; @IsString() code!: string; }
export class UpdateWarehouseDto { @IsOptional() @IsUUID() branchId?: string; @IsOptional() @IsString() name?: string; @IsOptional() @IsString() code?: string; }
export class CreateSupplierDto { @IsString() name!: string; @IsOptional() @IsString() contactName?: string; @IsOptional() @IsString() email?: string; @IsOptional() @IsString() phone?: string; @IsOptional() @IsString() address?: string; @IsOptional() @IsString() taxId?: string; }
export class UpdateSupplierDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsString() contactName?: string; @IsOptional() @IsString() email?: string; @IsOptional() @IsString() phone?: string; @IsOptional() @IsString() address?: string; @IsOptional() @IsString() taxId?: string; }
export class CreateIngredientDto { @IsOptional() @IsUUID() categoryId?: string; @IsString() sku!: string; @IsString() name!: string; @IsOptional() @IsString() description?: string; @IsUUID() inventoryUnitId!: string; @IsUUID() purchaseUnitId!: string; @IsNumber() @Min(0.000001) purchaseConversionFactor!: number; @IsOptional() @IsNumber() @Min(0) minimumStock?: number; }
export class UpdateIngredientDto { @IsOptional() @IsUUID() categoryId?: string; @IsOptional() @IsString() sku?: string; @IsOptional() @IsString() name?: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsUUID() inventoryUnitId?: string; @IsOptional() @IsUUID() purchaseUnitId?: string; @IsOptional() @IsNumber() @Min(0.000001) purchaseConversionFactor?: number; @IsOptional() @IsNumber() @Min(0) minimumStock?: number; }
export class ReceiptItemDto { @IsUUID() ingredientId!: string; @IsNumber() @Min(0.000001) purchaseQuantity!: number; @IsUUID() purchaseUnitId!: string; @IsNumber() @Min(0) conversionFactor!: number; @IsNumber() @Min(0) unitCost!: number; @IsOptional() @IsString() lotNumber?: string; @IsOptional() @IsDateString() expirationDate?: string; }
export class CreateReceiptDto { @IsUUID() branchId!: string; @IsUUID() warehouseId!: string; @IsOptional() @IsUUID() supplierId?: string; @IsOptional() @IsString() supplierInvoiceNumber?: string; @IsDateString() receivedAt!: string; @IsOptional() @IsString() notes?: string; @ValidateNested({ each: true }) @Type(() => ReceiptItemDto) items!: ReceiptItemDto[]; }
export class UpdateReceiptDto { @IsOptional() @IsUUID() branchId?: string; @IsOptional() @IsUUID() warehouseId?: string; @IsOptional() @IsUUID() supplierId?: string; @IsOptional() @IsString() supplierInvoiceNumber?: string; @IsOptional() @IsDateString() receivedAt?: string; @IsOptional() @IsString() notes?: string; @IsOptional() @ValidateNested({ each: true }) @Type(() => ReceiptItemDto) items?: ReceiptItemDto[]; }
export class RecipeItemDto { @IsUUID() ingredientId!: string; @IsNumber() @Min(0.000001) quantity!: number; @IsUUID() unitId!: string; @IsOptional() @IsNumber() @Min(0) wastePercentage?: number; @IsOptional() @IsNumber() position?: number; }
export class CreateRecipeDto { @IsOptional() @IsUUID() branchId?: string; @IsString() code!: string; @IsString() name!: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsUUID() categoryId?: string; @IsOptional() @IsUUID() outputIngredientId?: string; @IsNumber() @Min(0.000001) yieldQuantity!: number; @IsUUID() yieldUnitId!: string; @IsOptional() @IsNumber() sellingPrice?: number; @IsOptional() @IsEnum(RestaurantStockPolicy) requiredStockPolicy?: RestaurantStockPolicy; @ValidateNested({ each: true }) @Type(() => RecipeItemDto) items!: RecipeItemDto[]; }
export class RecipeVersionComponentDto { @IsEnum(RestaurantRecipeComponentType) componentType!: RestaurantRecipeComponentType; @IsOptional() @IsUUID() ingredientId?: string; @IsOptional() @IsUUID() subRecipeId?: string; @IsNumber() @Min(0.000001) quantity!: number; @IsUUID() unitId!: string; @IsOptional() @IsEnum(RestaurantRecipeQuantityMode) quantityMode?: RestaurantRecipeQuantityMode; @IsOptional() @IsNumber() @Min(0.0001) @Max(100) yieldPercentage?: number; @IsOptional() @IsNumber() @Min(0) @Max(99.9999) wastePercentage?: number; @IsOptional() @IsString() preparationInstructions?: string; @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number; }
export class RecipeStepDto { @IsInt() @Min(1) stepNumber!: number; @IsString() instruction!: string; @IsOptional() @IsString() imageUrl?: string; @IsOptional() @IsInt() @Min(0) estimatedMinutes?: number; }
export class CreateRecipeVersionDto { @IsNumber() @Min(0.000001) yieldQuantity!: number; @IsUUID() yieldUnitId!: string; @IsOptional() @IsNumber() @Min(0.000001) portions?: number; @IsOptional() @IsNumber() @Min(0.000001) portionQuantity?: number; @IsOptional() @IsUUID() portionUnitId?: string; @IsOptional() @IsNumber() @Min(0) sellingPriceSnapshot?: number; @IsOptional() @IsString() changeReason?: string; @ValidateNested({ each: true }) @Type(() => RecipeVersionComponentDto) components!: RecipeVersionComponentDto[]; @IsOptional() @ValidateNested({ each: true }) @Type(() => RecipeStepDto) steps?: RecipeStepDto[]; }
export class ConsumptionItemDto { @IsUUID() recipeId!: string; @IsNumber() @Min(0.000001) quantitySold!: number; }
export class CreateConsumptionDto { @IsUUID() branchId!: string; @IsUUID() warehouseId!: string; @IsDateString() consumptionDate!: string; @IsEnum(RestaurantShift) shift!: RestaurantShift; @IsOptional() @IsString() notes?: string; @ValidateNested({ each: true }) @Type(() => ConsumptionItemDto) items!: ConsumptionItemDto[]; }
export class OverrideConfirmationDto { @IsOptional() @IsString() @MinLength(10) justification?: string; }
export class WasteItemDto { @IsUUID() ingredientId!: string; @IsNumber() @Min(0.000001) quantity!: number; @IsUUID() unitId!: string; @IsOptional() @IsString() notes?: string; }
export class CreateWasteDto { @IsUUID() branchId!: string; @IsUUID() warehouseId!: string; @IsDateString() wasteDate!: string; @IsString() reason!: string; @ValidateNested({ each: true }) @Type(() => WasteItemDto) items!: WasteItemDto[]; }

export class CreateProductionDto { @IsUUID() branchId!: string; @IsUUID() warehouseId!: string; @IsUUID() recipeId!: string; @IsNumber() @Min(0.000001) plannedQuantity!: number; @IsNumber() @Min(0.000001) actualYield!: number; @IsDateString() productionDate!: string; }
export class CountItemDto { @IsUUID() ingredientId!: string; @IsNumber() @Min(0) countedQuantity!: number; @IsOptional() @IsString() reason?: string; @IsOptional() @IsString() notes?: string; }
export class CreateStockCountDto { @IsUUID() branchId!: string; @IsUUID() warehouseId!: string; @IsDateString() countedAt!: string; @ValidateNested({ each: true }) @Type(() => CountItemDto) items!: CountItemDto[]; }
export class TransferItemDto { @IsUUID() ingredientId!: string; @IsOptional() @IsUUID() lotId?: string; @IsNumber() @Min(0.000001) quantity!: number; }
export class CreateTransferDto { @IsUUID() sourceBranchId!: string; @IsUUID() sourceWarehouseId!: string; @IsUUID() destinationBranchId!: string; @IsUUID() destinationWarehouseId!: string; @ValidateNested({ each: true }) @Type(() => TransferItemDto) items!: TransferItemDto[]; }
export class CreateAdjustmentDto { @IsUUID() branchId!: string; @IsUUID() warehouseId!: string; @IsUUID() ingredientId!: string; @IsNumber() quantity!: number; @IsString() @MinLength(3) reason!: string; @IsOptional() @IsUUID() lotId?: string; }

export class CreateExternalMappingDto {
  @IsString() externalSystem!: string;
  @IsString() externalProductCode!: string;
  @IsOptional() @IsString() externalProductName?: string;
  @IsUUID() recipeId!: string;
  @IsOptional() @IsUUID() branchId?: string;
}

export class RestaurantReportQueryDto {
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsUUID() ingredientId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() recipeId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsNumber() @Min(1) page?: number;
  @IsOptional() @IsNumber() @Min(1) pageSize?: number;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @IsIn(['asc', 'desc']) direction?: 'asc' | 'desc';
}
