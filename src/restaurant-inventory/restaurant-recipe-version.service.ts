import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, RestaurantInventoryStatus, RestaurantRecipeComponentType, RestaurantRecipeQuantityMode, RestaurantRecipeStatus, RestaurantRecipeType, RestaurantRecipeVersionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { CreateRecipeVersionDto, RecipeVersionComponentDto } from './dto/restaurant-inventory.dto';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class RestaurantRecipeVersionService {
  constructor(private readonly prisma: PrismaService) {}
  private fail(message: string): never { throw new AppException(message, ErrorCode.BAD_REQUEST, HttpStatus.BAD_REQUEST); }
  private decimal(value: number | string | Prisma.Decimal) { return new Prisma.Decimal(value); }
  private async unit(db: Db, tenantId: string, id: string) {
    const unit = await db.restaurantInventoryUnit.findFirst({ where: { id, OR: [{ tenantId }, { tenantId: null }], status: RestaurantInventoryStatus.ACTIVE } });
    if (!unit) this.fail('Unidad de medida no encontrada o inactiva');
    return unit;
  }
  private async validateComponent(db: Db, tenantId: string, component: RecipeVersionComponentDto) {
    if (component.componentType === RestaurantRecipeComponentType.INGREDIENT) {
      if (!component.ingredientId || component.subRecipeId) this.fail('Un componente INGREDIENT requiere ingredientId');
      const ingredient = await db.restaurantIngredient.findFirst({ where: { id: component.ingredientId, tenantId, status: RestaurantInventoryStatus.ACTIVE } });
      if (!ingredient) this.fail('Ingrediente no encontrado o inactivo');
      await this.unit(db, tenantId, component.unitId);
      return;
    }
    if (!component.subRecipeId || component.ingredientId) this.fail('Un componente SUB_RECIPE requiere subRecipeId');
    const recipe = await db.restaurantRecipe.findFirst({ where: { id: component.subRecipeId, tenantId, status: { not: 'ARCHIVED' } } });
    if (!recipe) this.fail('Subreceta no encontrada');
    await this.unit(db, tenantId, component.unitId);
  }
  async createVersion(tenantId: string, userId: string, recipeId: string, dto: CreateRecipeVersionDto) {
    const recipe = await this.prisma.restaurantRecipe.findFirst({ where: { id: recipeId, tenantId, status: { not: 'ARCHIVED' } } });
    if (!recipe) this.fail('Receta no encontrada');
    if (!dto.components?.length) this.fail('La versión debe contener al menos un componente');
    for (const component of dto.components) await this.validateComponent(this.prisma, tenantId, component);
    const last = await this.prisma.restaurantRecipeVersion.findFirst({ where: { tenantId, recipeId }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
    return this.prisma.$transaction(async (tx) => tx.restaurantRecipeVersion.create({ data: { tenantId, recipeId, versionNumber: (last?.versionNumber ?? 0) + 1, yieldQuantity: this.decimal(dto.yieldQuantity), yieldUnitId: dto.yieldUnitId, portions: dto.portions == null ? null : this.decimal(dto.portions), portionQuantity: dto.portionQuantity == null ? null : this.decimal(dto.portionQuantity), portionUnitId: dto.portionUnitId, sellingPriceSnapshot: dto.sellingPriceSnapshot == null ? recipe.sellingPrice : this.decimal(dto.sellingPriceSnapshot), changeReason: dto.changeReason, createdBy: userId, components: { create: dto.components.map((component) => ({ tenantId, componentType: component.componentType, ingredientId: component.ingredientId, subRecipeId: component.subRecipeId, quantity: this.decimal(component.quantity), unitId: component.unitId, quantityMode: component.quantityMode ?? RestaurantRecipeQuantityMode.GROSS, yieldPercentage: component.yieldPercentage == null ? null : this.decimal(component.yieldPercentage), wastePercentage: component.wastePercentage == null ? null : this.decimal(component.wastePercentage), convertedGrossQuantity: this.decimal(component.quantity), preparationInstructions: component.preparationInstructions, position: component.position ?? 0 })) }, steps: dto.steps ? { create: dto.steps.map((step) => ({ tenantId, stepNumber: step.stepNumber, instruction: step.instruction, imageUrl: step.imageUrl, estimatedMinutes: step.estimatedMinutes })) } : undefined }, include: { components: true, steps: true } }));
  }
  private async componentGraph(tenantId: string, recipeId: string, targetVersionId?: string, path = new Set<string>(), depth = 0): Promise<void> {
    if (depth > 12) this.fail('La profundidad máxima de subrecetas fue excedida');
    if (path.has(recipeId)) this.fail('Se detectó un ciclo entre subrecetas');
    const nextPath = new Set(path).add(recipeId);
    const version = targetVersionId
      ? await this.prisma.restaurantRecipeVersion.findFirst({ where: { id: targetVersionId, tenantId, recipeId }, include: { components: true } })
      : await this.prisma.restaurantRecipeVersion.findFirst({ where: { tenantId, recipeId, status: RestaurantRecipeVersionStatus.PUBLISHED }, orderBy: { versionNumber: 'desc' }, include: { components: true } });
    if (!version) return;
    for (const component of version.components) if (component.componentType === RestaurantRecipeComponentType.SUB_RECIPE && component.subRecipeId) await this.componentGraph(tenantId, component.subRecipeId, undefined, nextPath, depth + 1);
  }
  private async computeCost(tenantId: string, versionId: string) {
    const version = await this.prisma.restaurantRecipeVersion.findFirst({ where: { id: versionId, tenantId }, include: { recipe: true, components: true } });
    if (!version) this.fail('Versión no encontrada');
    let batch = new Prisma.Decimal(0);
    const snapshots: Array<{ id: string; gross: Prisma.Decimal; unitCost: Prisma.Decimal; total: Prisma.Decimal }> = [];
    for (const component of version.components) {
      let unitCost = new Prisma.Decimal(0);
      if (component.componentType === RestaurantRecipeComponentType.INGREDIENT && component.ingredientId) {
        const ingredient = await this.prisma.restaurantIngredient.findFirst({ where: { id: component.ingredientId, tenantId, status: RestaurantInventoryStatus.ACTIVE } });
        if (!ingredient) this.fail('Ingrediente no encontrado o inactivo');
        const from = await this.unit(this.prisma, tenantId, component.unitId);
        const to = await this.unit(this.prisma, tenantId, ingredient!.inventoryUnitId);
        if (from.type !== to.type) this.fail('Unidad de componente incompatible con el ingrediente');
        let gross = new Prisma.Decimal(component.quantity);
        if (component.quantityMode === RestaurantRecipeQuantityMode.USABLE) {
          const yieldPercent = new Prisma.Decimal(component.yieldPercentage ?? 100);
          if (yieldPercent.lte(0) || yieldPercent.gt(100)) this.fail('Rendimiento inválido');
          gross = gross.div(yieldPercent.div(100));
        }
        gross = gross.mul(from.conversionFactor).div(to.conversionFactor);
        unitCost = new Prisma.Decimal(ingredient!.currentAverageCost);
        const total = gross.mul(unitCost);
        snapshots.push({ id: component.id, gross, unitCost, total });
        batch = batch.add(total);
      } else if (component.subRecipeId) {
        const sub = await this.prisma.restaurantRecipeVersion.findFirst({ where: { tenantId, recipeId: component.subRecipeId, status: RestaurantRecipeVersionStatus.PUBLISHED }, orderBy: { versionNumber: 'desc' } });
        if (!sub) this.fail('La subreceta debe tener una versión publicada');
        unitCost = new Prisma.Decimal(sub!.batchCostSnapshot).div(sub!.yieldQuantity);
        const total = new Prisma.Decimal(component.quantity).mul(unitCost);
        snapshots.push({ id: component.id, gross: new Prisma.Decimal(component.quantity), unitCost, total });
        batch = batch.add(total);
      }
    }
    const portions = version.portions ?? new Prisma.Decimal(1);
    const portionCost = batch.div(portions);
    const selling = version.sellingPriceSnapshot;
    const foodCost = selling && selling.gt(0) ? portionCost.div(selling).mul(100) : null;
    const margin = selling ? selling.sub(portionCost) : null;
    return { version, batch, portionCost, foodCost, margin, snapshots };
  }
  async validateVersion(tenantId: string, recipeId: string, versionId: string) {
    const version = await this.prisma.restaurantRecipeVersion.findFirst({ where: { id: versionId, recipeId, tenantId }, include: { recipe: true, components: true } });
    if (!version) this.fail('Versión no encontrada');
    if (version.recipe.type !== RestaurantRecipeType.MENU_ITEM && !version.recipe.outputIngredientId) this.fail('PREPARATION y YIELD requieren outputIngredientId');
    if (!version.components.length) this.fail('La versión debe contener al menos un componente');
    if (version.yieldQuantity.lte(0)) this.fail('El rendimiento debe ser mayor que cero');
    await this.componentGraph(tenantId, recipeId, versionId);
    const cost = await this.computeCost(tenantId, versionId);
    return { valid: true, errors: [], warnings: cost.foodCost == null ? ['La receta no tiene precio de venta para calcular food cost'] : [], cost: { batch: cost.batch, portion: cost.portionCost, foodCostPercentage: cost.foodCost, grossMargin: cost.margin } };
  }
  async publishVersion(tenantId: string, userId: string, recipeId: string, versionId: string) {
    await this.validateVersion(tenantId, recipeId, versionId);
    const cost = await this.computeCost(tenantId, versionId);
    return this.prisma.$transaction(async (tx) => {
      await tx.restaurantRecipeVersion.updateMany({ where: { tenantId, recipeId, status: RestaurantRecipeVersionStatus.PUBLISHED }, data: { status: RestaurantRecipeVersionStatus.SUPERSEDED } });
      const published = await tx.restaurantRecipeVersion.update({ where: { id: versionId }, data: { status: RestaurantRecipeVersionStatus.PUBLISHED, publishedBy: userId, publishedAt: new Date(), batchCostSnapshot: cost.batch, portionCostSnapshot: cost.portionCost, foodCostPercentageSnapshot: cost.foodCost, grossMarginSnapshot: cost.margin } });
      await tx.restaurantRecipe.update({ where: { id: recipeId }, data: { status: RestaurantRecipeStatus.ACTIVE, currentVersionId: versionId, calculatedCost: cost.portionCost, currentFoodCostPercentage: cost.foodCost, currentGrossMargin: cost.margin, currentCostCalculatedAt: new Date() } });
      return published;
    });
  }
  async listVersions(tenantId: string, recipeId: string) { return this.prisma.restaurantRecipeVersion.findMany({ where: { tenantId, recipeId }, orderBy: { versionNumber: 'desc' }, include: { components: { orderBy: { position: 'asc' } }, steps: { orderBy: { stepNumber: 'asc' } } } }); }
}
