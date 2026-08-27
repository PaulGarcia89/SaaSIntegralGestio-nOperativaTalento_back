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
    if (!Number.isFinite(Number(component.quantity)) || Number(component.quantity) <= 0) this.fail('La cantidad del componente debe ser mayor que cero');
    if (component.wastePercentage != null && (component.wastePercentage < 0 || component.wastePercentage >= 100)) this.fail('Merma inválida');
    if (component.quantityMode === RestaurantRecipeQuantityMode.USABLE && (component.yieldPercentage == null || component.yieldPercentage <= 0 || component.yieldPercentage > 100)) this.fail('Rendimiento inválido');
    if (component.componentType === RestaurantRecipeComponentType.INGREDIENT) {
      if (!component.ingredientId || component.subRecipeId) this.fail('Un componente INGREDIENT requiere ingredientId');
      const ingredient = await db.restaurantIngredient.findFirst({ where: { id: component.ingredientId, tenantId, status: RestaurantInventoryStatus.ACTIVE } });
      if (!ingredient) this.fail('Ingrediente no encontrado o inactivo');
      const from = await this.unit(db, tenantId, component.unitId);
      const to = await this.unit(db, tenantId, ingredient!.inventoryUnitId);
      if (from.type !== to.type) this.fail('Unidad de componente incompatible con el ingrediente');
      if (Number(ingredient!.currentAverageCost) <= 0) this.fail('El ingrediente no tiene un costo promedio válido');
      return;
    }
    if (!component.subRecipeId || component.ingredientId) this.fail('Un componente SUB_RECIPE requiere subRecipeId');
    const recipe = await db.restaurantRecipe.findFirst({ where: { id: component.subRecipeId, tenantId, status: { not: 'ARCHIVED' } } });
    if (!recipe) this.fail('Subreceta no encontrada');
    const from = await this.unit(db, tenantId, component.unitId);
    const to = await this.unit(db, tenantId, recipe!.yieldUnitId);
    if (from.type !== to.type) this.fail('Unidad de componente incompatible con la subreceta');
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
    if (version.portions && version.portions.lte(0)) this.fail('Las porciones deben ser mayores que cero');
    const yieldUnit = await this.unit(this.prisma, tenantId, version.yieldUnitId);
    if (version.recipe.outputIngredientId) {
      const output = await this.prisma.restaurantIngredient.findFirst({ where: { id: version.recipe.outputIngredientId, tenantId, status: RestaurantInventoryStatus.ACTIVE } });
      if (!output) this.fail('Ingrediente de salida no encontrado o inactivo');
      const outputUnit = await this.unit(this.prisma, tenantId, output!.inventoryUnitId);
      if (yieldUnit.type !== outputUnit.type) this.fail('La unidad de rendimiento es incompatible con el ingrediente de salida');
    }
    for (const component of version.components) {
      if (component.quantity.lte(0)) this.fail('La cantidad del componente debe ser mayor que cero');
      if (component.wastePercentage && (component.wastePercentage.lt(0) || component.wastePercentage.gte(100))) this.fail('Merma inválida');
      if (component.quantityMode === RestaurantRecipeQuantityMode.USABLE && (!component.yieldPercentage || component.yieldPercentage.lte(0) || component.yieldPercentage.gt(100))) this.fail('Rendimiento inválido');
    }
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

  async detail(tenantId: string, recipeId: string) {
    const recipe: any = await this.prisma.restaurantRecipe.findFirst({ where: { id: recipeId, tenantId }, include: { items: true, versions: { orderBy: { versionNumber: 'desc' }, include: { components: { orderBy: { position: 'asc' } }, steps: { orderBy: { stepNumber: 'asc' } } } } } });
    if (!recipe) this.fail('Receta no encontrada');
    const ingredientIds = [...new Set([...recipe.items.map((item: any) => item.ingredientId), ...recipe.versions.flatMap((version: any) => version.components.map((component: any) => component.ingredientId).filter(Boolean))])];
    const unitIds = [...new Set([recipe.yieldUnitId, ...recipe.items.map((item: any) => item.unitId), ...recipe.versions.flatMap((version: any) => [version.yieldUnitId, ...version.components.map((component: any) => component.unitId)])])];
    const [ingredients, units] = await Promise.all([
      this.prisma.restaurantIngredient.findMany({ where: { tenantId, id: { in: ingredientIds } }, select: { id: true, name: true, sku: true } }),
      this.prisma.restaurantInventoryUnit.findMany({ where: { id: { in: unitIds }, OR: [{ tenantId }, { tenantId: null }] }, select: { id: true, name: true, abbreviation: true } }),
    ]);
    const ingredientNames = new Map(ingredients.map((item) => [item.id, item]));
    const unitNames = new Map(units.map((item) => [item.id, item]));
    const enrich = (row: any) => ({ ...row, ingredient: row.ingredientId ? ingredientNames.get(row.ingredientId) ?? null : null, unit: unitNames.get(row.unitId) ?? null });
    return { ...recipe, items: recipe.items.map(enrich), versions: recipe.versions.map((version: any) => ({ ...version, yieldUnit: unitNames.get(version.yieldUnitId) ?? null, components: version.components.map(enrich) })) };
  }

  async duplicateVersion(tenantId: string, userId: string, recipeId: string, versionId: string, changeReason?: string) {
    const source: any = await this.prisma.restaurantRecipeVersion.findFirst({ where: { id: versionId, tenantId, recipeId }, include: { components: true, steps: true } });
    if (!source) this.fail('Versión no encontrada');
    const last = await this.prisma.restaurantRecipeVersion.findFirst({ where: { tenantId, recipeId }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
    return this.prisma.restaurantRecipeVersion.create({ data: { tenantId, recipeId, versionNumber: (last?.versionNumber ?? 0) + 1, yieldQuantity: source.yieldQuantity, yieldUnitId: source.yieldUnitId, portions: source.portions, portionQuantity: source.portionQuantity, portionUnitId: source.portionUnitId, sellingPriceSnapshot: source.sellingPriceSnapshot, changeReason: changeReason ?? `Duplicada desde versión ${source.versionNumber}`, createdBy: userId, components: { create: source.components.map((component: any) => ({ tenantId, componentType: component.componentType, ingredientId: component.ingredientId, subRecipeId: component.subRecipeId, quantity: component.quantity, unitId: component.unitId, quantityMode: component.quantityMode, yieldPercentage: component.yieldPercentage, wastePercentage: component.wastePercentage, convertedGrossQuantity: component.convertedGrossQuantity, unitCostSnapshot: component.unitCostSnapshot, totalCostSnapshot: component.totalCostSnapshot, preparationInstructions: component.preparationInstructions, position: component.position })) }, steps: { create: source.steps.map((step: any) => ({ tenantId, stepNumber: step.stepNumber, instruction: step.instruction, imageUrl: step.imageUrl, estimatedMinutes: step.estimatedMinutes })) } }, include: { components: true, steps: true } });
  }

  async compareVersions(tenantId: string, recipeId: string, leftId: string, rightId: string) {
    const versions: any[] = await this.prisma.restaurantRecipeVersion.findMany({ where: { tenantId, recipeId, id: { in: [leftId, rightId] } }, include: { components: { orderBy: { position: 'asc' } }, steps: { orderBy: { stepNumber: 'asc' } } } });
    if (versions.length !== 2) this.fail('Las versiones a comparar no pertenecen a la receta');
    const left = versions.find((version) => version.id === leftId)!;
    const right = versions.find((version) => version.id === rightId)!;
    return { recipeId, from: left, to: right, changes: { yieldQuantity: [String(left.yieldQuantity), String(right.yieldQuantity)], portions: [left.portions ? String(left.portions) : null, right.portions ? String(right.portions) : null], batchCost: [String(left.batchCostSnapshot), String(right.batchCostSnapshot)], portionCost: [String(left.portionCostSnapshot), String(right.portionCostSnapshot)], componentCount: [left.components.length, right.components.length], stepCount: [left.steps.length, right.steps.length], status: [left.status, right.status] } };
  }
}
