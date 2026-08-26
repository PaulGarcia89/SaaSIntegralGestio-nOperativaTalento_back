import { HttpStatus, Injectable } from '@nestjs/common';
import { RestaurantCommercialBudgetOveragePolicy, RestaurantCommercialBudgetStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-code.enum';

type ForecastGranularity = 'daily' | 'weekly' | 'monthly';
type CommercialQuery = { branchId?: string; branchIds?: string[]; warehouseId?: string; recipeId?: string; ingredientId?: string; categoryId?: string; supplierId?: string; status?: string; from?: string; to?: string; periodStart?: string; periodEnd?: string; horizon?: number; granularity?: ForecastGranularity; horizonDays?: number; page?: number; pageSize?: number; sortBy?: string; sortOrder?: 'asc' | 'desc'; metric?: string; groupBy?: string; normalized?: boolean };

@Injectable()
export class RestaurantCommercialService {
  constructor(private readonly prisma: PrismaService) {}
  private fail(message: string, code = ErrorCode.BAD_REQUEST, status = HttpStatus.BAD_REQUEST): never { throw new AppException(message, code, status); }
  private async context(tenantId: string, branchId?: string, warehouseId?: string) {
    if (branchId) { const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } }); if (!branch) this.fail('Sucursal no encontrada o fuera de la empresa', ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN); }
    if (warehouseId) { const warehouse = await this.prisma.restaurantInventoryWarehouse.findFirst({ where: { id: warehouseId, tenantId }, select: { id: true, branchId: true } }); if (!warehouse) this.fail('Almacén no encontrado en la empresa', ErrorCode.TENANT_ACCESS_DENIED, HttpStatus.NOT_FOUND); if (branchId && warehouse.branchId !== branchId) this.fail('El almacén no pertenece a la sucursal', ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN); }
  }
  private period(query: CommercialQuery) { const end = query.periodEnd ? new Date(query.periodEnd) : new Date(); const start = query.periodStart ? new Date(query.periodStart) : new Date(end.getTime() - 30 * 86400000); if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) this.fail('Rango de fechas inválido', ErrorCode.VALIDATION_ERROR, HttpStatus.UNPROCESSABLE_ENTITY); return { start, end }; }
  private page(query: CommercialQuery) { const page = Math.max(1, Number(query.page) || 1); const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 50)); return { page, pageSize }; }
  private paginate(rows: any[], query: CommercialQuery) { const { page, pageSize } = this.page(query); if (query.sortBy) rows.sort((a, b) => { const left = a[query.sortBy!]; const right = b[query.sortBy!]; const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true }); return query.sortOrder === 'desc' ? -result : result; }); const total = rows.length; return { rows: rows.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }; }
  private forecastPeriod(query: CommercialQuery) { const end = query.to ? new Date(query.to) : query.periodEnd ? new Date(query.periodEnd) : new Date(); const start = query.from ? new Date(query.from) : query.periodStart ? new Date(query.periodStart) : new Date(end.getTime() - 90 * 86400000); if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) this.fail('Rango de fechas inválido', ErrorCode.VALIDATION_ERROR, HttpStatus.UNPROCESSABLE_ENTITY); return { start, end }; }
  private bucketStart(value: Date, granularity: ForecastGranularity) { const date = new Date(value); date.setUTCHours(0, 0, 0, 0); if (granularity === 'monthly') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)); if (granularity === 'weekly') { const day = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() - day + 1); } return date; }
  private addBucket(value: Date, granularity: ForecastGranularity, count = 1) { const date = new Date(value); if (granularity === 'monthly') date.setUTCMonth(date.getUTCMonth() + count); else date.setUTCDate(date.getUTCDate() + (granularity === 'weekly' ? 7 : 1) * count); return date; }
  private bucketDays(granularity: ForecastGranularity) { return granularity === 'monthly' ? 30 : granularity === 'weekly' ? 7 : 1; }
  private weightedAverage(values: number[]) { if (!values.length) return { mean: 0, deviation: 0 }; const totalWeight = values.reduce((sum, _value, index) => sum + index + 1, 0); const mean = values.reduce((sum, value, index) => sum + value * (index + 1), 0) / totalWeight; const variance = values.reduce((sum, value, index) => sum + (index + 1) * (value - mean) ** 2, 0) / totalWeight; return { mean, deviation: Math.sqrt(variance) }; }
  async demandForecast(tenantId: string, query: CommercialQuery = {}) {
    await this.context(tenantId, query.branchId, query.warehouseId);
    const { start, end } = this.forecastPeriod(query);
    const granularity: ForecastGranularity = query.granularity ?? 'daily';
    const horizon = Math.min(365, Math.max(1, Number(query.horizon ?? query.horizonDays) || 30));
    const generatedAt = new Date();
    const modelVersion = 'WMA-v1';
    const records: any[] = await this.prisma.restaurantConsumptionRecord.findMany({ where: { tenantId, status: 'CONFIRMED', consumptionDate: { gte: start, lte: end }, ...(query.branchId ? { branchId: query.branchId } : {}), ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}) }, include: { items: true } });
    const recipeIds = [...new Set(records.flatMap((record) => record.items.map((item: any) => item.recipeId)).filter(Boolean))];
    const recipes: any[] = await this.prisma.restaurantRecipe.findMany({ where: { tenantId, id: { in: recipeIds }, ...(query.recipeId ? { id: query.recipeId } : {}) }, include: { items: true } });
    const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    const candidateIngredientIds = [...new Set(recipes.flatMap((recipe) => recipe.items.map((line: any) => line.ingredientId)).filter((id: string) => !query.ingredientId || id === query.ingredientId))];
    const ingredients: any[] = await this.prisma.restaurantIngredient.findMany({ where: { tenantId, ...(candidateIngredientIds.length ? { id: { in: candidateIngredientIds } } : {}), ...(query.ingredientId ? { id: query.ingredientId } : {}), ...(query.categoryId ? { categoryId: query.categoryId } : {}) }, select: { id: true, sku: true, name: true, inventoryUnitId: true, currentAverageCost: true } });
    const ingredientIds = new Set(ingredients.map((ingredient) => ingredient.id));
    const units: any[] = await this.prisma.restaurantInventoryUnit.findMany({ where: { id: { in: ingredients.map((ingredient) => ingredient.inventoryUnitId) }, OR: [{ tenantId }, { tenantId: null }] }, select: { id: true, name: true, abbreviation: true } });
    const unitMap = new Map(units.map((unit) => [unit.id, unit]));
    const demand = new Map<string, number>();
    for (const record of records) for (const item of record.items) { const recipe = recipeMap.get(item.recipeId); if (!recipe) continue; for (const line of recipe.items) if (ingredientIds.has(line.ingredientId)) { const bucket = this.bucketStart(new Date(record.consumptionDate), granularity).toISOString(); const key = `${record.branchId}:${record.warehouseId}:${line.ingredientId}:${bucket}`; demand.set(key, (demand.get(key) ?? 0) + Number(line.convertedInventoryQuantity) * Number(item.quantitySold)); } }
    const movementRows: any[] = await this.prisma.restaurantInventoryMovement.findMany({ where: { tenantId, occurredAt: { lte: end }, ...(query.branchId ? { branchId: query.branchId } : {}), ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}), ...(query.ingredientId ? { ingredientId: query.ingredientId } : {}), ...(ingredientIds.size ? { ingredientId: { in: [...ingredientIds] } } : {}) }, select: { branchId: true, warehouseId: true, ingredientId: true, direction: true, quantity: true, occurredAt: true } });
    const stockAt = (branchId: string, warehouseId: string, ingredientId: string, at: Date) => movementRows.filter((row) => row.branchId === branchId && row.warehouseId === warehouseId && row.ingredientId === ingredientId && new Date(row.occurredAt) <= at).reduce((sum, row) => sum + (row.direction === 'IN' ? Number(row.quantity) : -Number(row.quantity)), 0);
    const scopes = [...new Map(records.map((record) => [`${record.branchId}:${record.warehouseId}`, { branchId: record.branchId, warehouseId: record.warehouseId }])).values()];
    if (!scopes.length && query.branchId && query.warehouseId) scopes.push({ branchId: query.branchId, warehouseId: query.warehouseId });
    if (!scopes.length && query.branchId && !query.warehouseId) {
      const warehouses: any[] = await this.prisma.restaurantInventoryWarehouse.findMany({ where: { tenantId, branchId: query.branchId }, select: { id: true, branchId: true } });
      scopes.push(...warehouses.map((warehouse) => ({ branchId: warehouse.branchId, warehouseId: warehouse.id })));
    }
    if (!scopes.length && !query.branchId) {
      const warehouses: any[] = await this.prisma.restaurantInventoryWarehouse.findMany({ where: { tenantId, ...(query.warehouseId ? { id: query.warehouseId } : {}) }, select: { id: true, branchId: true } });
      scopes.push(...warehouses.map((warehouse) => ({ branchId: warehouse.branchId, warehouseId: warehouse.id })));
    }
    const branches = [...new Set(scopes.map((scope) => scope.branchId))];
    const branchRows: any[] = await this.prisma.branch.findMany({ where: { tenantId, id: { in: branches } }, select: { id: true, name: true } });
    const branchMap = new Map(branchRows.map((branch) => [branch.id, branch.name]));
    const minHistoryDays = Math.max(1, Number(process.env.RESTAURANT_COMMERCIAL_FORECAST_MIN_HISTORY_DAYS ?? 14));
    const firstBucket = this.bucketStart(start, granularity);
    const lastBucket = this.bucketStart(end, granularity);
    const rows: any[] = [];
    for (const scope of scopes) for (const ingredient of ingredients) {
      const { branchId, warehouseId } = scope;
      const series: number[] = [];
      const censoredPeriods: string[] = [];
      for (let bucket = new Date(firstBucket); bucket <= lastBucket; bucket = this.addBucket(bucket, granularity)) {
        const bucketEnd = new Date(this.addBucket(bucket, granularity).getTime() - 1);
        const stock = stockAt(branchId, warehouseId, ingredient.id, bucketEnd);
        if (stock <= 0 && movementRows.some((movement) => movement.branchId === branchId && movement.ingredientId === ingredient.id && new Date(movement.occurredAt) <= bucketEnd)) { censoredPeriods.push(bucket.toISOString()); continue; }
        series.push(demand.get(`${branchId}:${warehouseId}:${ingredient.id}:${bucket.toISOString()}`) ?? 0);
      }
      const availableHistoryDays = series.length * this.bucketDays(granularity);
      const stats = this.weightedAverage(series);
      const insufficient = availableHistoryDays < minHistoryDays || !series.length;
      const confidence = insufficient ? 0 : Math.min(0.99, Number((series.length / (series.length + censoredPeriods.length + 1)).toFixed(4)));
      const branchName = branchMap.get(branchId) ?? branchId;
      const unit = unitMap.get(ingredient.inventoryUnitId) ?? { id: ingredient.inventoryUnitId, name: ingredient.inventoryUnitId, abbreviation: ingredient.inventoryUnitId };
      for (let index = 1; index <= horizon; index++) {
        const forecastStart = this.addBucket(lastBucket, granularity, index);
        const forecastEnd = new Date(this.addBucket(forecastStart, granularity).getTime() - 1);
        const margin = 1.96 * stats.deviation;
        rows.push({ period: { start: forecastStart, end: forecastEnd }, ingredient: { id: ingredient.id, sku: ingredient.sku, name: ingredient.name }, branch: { id: branchId, name: branchName }, forecastQuantity: insufficient ? null : Number(stats.mean.toFixed(6)), unit, confidence, lowerBound: insufficient ? null : Number(Math.max(0, stats.mean - margin).toFixed(6)), upperBound: insufficient ? null : Number((stats.mean + margin).toFixed(6)), historicalDemandUsed: Number(series.reduce((sum, value) => sum + value, 0).toFixed(6)), censoredPeriods, status: insufficient ? 'INSUFFICIENT_HISTORY' : 'READY', generatedAt, modelVersion, granularity });
      }
    }
    return { period: { start, end }, horizon, granularity, generatedAt, modelVersion, ...this.paginate(rows, query) };
  }
  private signedCost(row: any) { return (row.direction === 'IN' ? 1 : -1) * Number(row._sum?.totalCost ?? 0); }
  private async branchCostSnapshot(tenantId: string, query: CommercialQuery, start: Date, end: Date, ingredientIds?: string[]) {
    const movementWhere: any = { tenantId, occurredAt: { gte: start, lte: end }, ...(query.branchIds?.length ? { branchId: { in: query.branchIds } } : query.branchId ? { branchId: query.branchId } : {}), ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}), ...(ingredientIds?.length ? { ingredientId: { in: ingredientIds } } : {}) };
    const [movementGroups, balances, counts, sales] = await Promise.all([
      this.prisma.restaurantInventoryMovement.groupBy({ by: ['branchId', 'direction', 'movementType', 'referenceType'], where: movementWhere, _sum: { totalCost: true } }),
      this.prisma.restaurantInventoryBalance.findMany({ where: { tenantId, ...(query.branchIds?.length ? { branchId: { in: query.branchIds } } : query.branchId ? { branchId: query.branchId } : {}), ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}), ...(ingredientIds?.length ? { ingredientId: { in: ingredientIds } } : {}) }, select: { branchId: true, quantityOnHand: true, averageCost: true } }),
      this.prisma.restaurantStockCount.findMany({ where: { tenantId, status: 'APPROVED', countedAt: { gte: start, lte: end }, ...(query.branchIds?.length ? { branchId: { in: query.branchIds } } : query.branchId ? { branchId: query.branchId } : {}), ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}) }, include: { items: true } }),
      this.prisma.restaurantConsumptionRecord.findMany({ where: { tenantId, status: 'CONFIRMED', consumptionDate: { gte: start, lte: end }, ...(query.branchIds?.length ? { branchId: { in: query.branchIds } } : query.branchId ? { branchId: query.branchId } : {}), ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}) }, include: { items: true } }),
    ]);
    const result = new Map<string, any>();
    const get = (branchId: string) => result.get(branchId) ?? { purchasesConfirmed: 0, transferredCost: 0, consumptionCost: 0, wasteCost: 0, adjustments: 0, theoreticalRealVariance: 0, inventoryValue: 0, revenue: 0 };
    for (const row of movementGroups) {
      const item = get(row.branchId);
      const cost = row.movementType === 'MANUAL_ADJUSTMENT' ? this.signedCost(row) : Math.abs(Number(row._sum?.totalCost ?? 0));
      if (row.referenceType === 'PURCHASE_ORDER' || row.referenceType === 'GOODS_RECEIPT') item.purchasesConfirmed += cost;
      else if (row.referenceType === 'TRANSFER_RECEIPT' || row.referenceType === 'TRANSFER') item.transferredCost += cost;
      else if (row.referenceType === 'CONSUMPTION') item.consumptionCost += cost;
      else if (row.referenceType === 'WASTE') item.wasteCost += cost;
      if (row.movementType === 'MANUAL_ADJUSTMENT') item.adjustments += cost;
      result.set(row.branchId, item);
    }
    for (const balance of balances) { const item = get(balance.branchId); item.inventoryValue += Number(balance.quantityOnHand) * Number(balance.averageCost); result.set(balance.branchId, item); }
    for (const count of counts) { const item = get(count.branchId); for (const line of count.items) if (!ingredientIds?.length || ingredientIds.includes(line.ingredientId)) item.theoreticalRealVariance += Number(line.varianceValue); result.set(count.branchId, item); }
    for (const sale of sales) { const item = get(sale.branchId); item.revenue += sale.items.reduce((sum: number, line: any) => sum + Number(line.quantitySold) * Number(line.sellingPriceSnapshot), 0); result.set(sale.branchId, item); }
    for (const item of result.values()) item.foodCostPercent = item.revenue > 0 ? item.consumptionCost / item.revenue * 100 : null;
    return result;
  }
  async branchCosts(tenantId: string, query: CommercialQuery = {}) {
    await this.context(tenantId, query.branchId, query.warehouseId);
    const end = query.to ? new Date(query.to) : query.periodEnd ? new Date(query.periodEnd) : new Date();
    const start = query.from ? new Date(query.from) : query.periodStart ? new Date(query.periodStart) : new Date(end.getTime() - 30 * 86400000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) this.fail('Rango de fechas inválido', ErrorCode.VALIDATION_ERROR, HttpStatus.UNPROCESSABLE_ENTITY);
    const ingredients = query.categoryId ? await this.prisma.restaurantIngredient.findMany({ where: { tenantId, categoryId: query.categoryId, status: 'ACTIVE' }, select: { id: true } }) : [];
    const ingredientIds = ingredients.map((ingredient) => ingredient.id);
    if (query.categoryId && !ingredientIds.length) return { period: { start, end }, rows: [], page: 1, pageSize: this.page(query).pageSize, total: 0, totalPages: 1 };
    const duration = end.getTime() - start.getTime();
    const previousEnd = new Date(start.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - duration);
    const [current, previous, branchRows] = await Promise.all([
      this.branchCostSnapshot(tenantId, query, start, end, ingredientIds),
      this.branchCostSnapshot(tenantId, query, previousStart, previousEnd, ingredientIds),
      this.prisma.branch.findMany({ where: { tenantId, ...(query.branchIds?.length ? { id: { in: query.branchIds } } : query.branchId ? { id: query.branchId } : {}) }, select: { id: true, name: true } }),
    ]);
    const branchIds = new Set([...current.keys(), ...previous.keys(), ...branchRows.map((branch) => branch.id)]);
    const names = new Map(branchRows.map((branch) => [branch.id, branch.name]));
    const metrics = ['purchasesConfirmed', 'consumptionCost', 'inventoryValue', 'wasteCost', 'adjustments', 'theoreticalRealVariance', 'foodCostPercent'];
    const rows = [...branchIds].map((branchId) => {
      const now = current.get(branchId) ?? { purchasesConfirmed: 0, consumptionCost: 0, inventoryValue: 0, wasteCost: 0, adjustments: 0, theoreticalRealVariance: 0, foodCostPercent: null };
      const before = previous.get(branchId) ?? { purchasesConfirmed: 0, consumptionCost: 0, inventoryValue: 0, wasteCost: 0, adjustments: 0, theoreticalRealVariance: 0, foodCostPercent: null };
      const change: any = {}; const changePercent: any = {};
      for (const metric of metrics) { change[metric] = now[metric] === null || before[metric] === null ? null : Number((now[metric] - before[metric]).toFixed(2)); changePercent[metric] = before[metric] ? Number(((now[metric] - before[metric]) / Math.abs(before[metric]) * 100).toFixed(4)) : null; }
      return { period: { start, end }, branch: { id: branchId, name: names.get(branchId) ?? branchId }, purchasesConfirmed: Number(now.purchasesConfirmed.toFixed(2)), transferredCost: Number((now.transferredCost ?? 0).toFixed(2)), consumptionCost: Number(now.consumptionCost.toFixed(2)), inventoryValue: Number(now.inventoryValue.toFixed(2)), wasteCost: Number(now.wasteCost.toFixed(2)), adjustments: Number(now.adjustments.toFixed(2)), theoreticalRealVariance: Number(now.theoreticalRealVariance.toFixed(2)), foodCostPercent: now.foodCostPercent === null ? null : Number(now.foodCostPercent.toFixed(4)), salesRevenue: Number((now.revenue ?? 0).toFixed(2)), changeVsPreviousPeriod: change, changeVsPreviousPeriodPercent: changePercent };
    });
    return { period: { start, end }, ...this.paginate(rows, query) };
  }
  async legacyRecipeMargins(tenantId: string, query: CommercialQuery = {}) { await this.context(tenantId, query.branchId, query.warehouseId); const { start, end } = this.period(query); const records: any[] = await this.prisma.restaurantConsumptionRecord.findMany({ where: { tenantId, status: 'CONFIRMED', consumptionDate: { gte: start, lte: end }, ...(query.branchId ? { branchId: query.branchId } : {}), ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}) }, include: { items: true } }); const grouped = new Map<string, { revenue: number; cost: number; quantity: number }>(); for (const record of records) for (const item of record.items) { if (query.recipeId && item.recipeId !== query.recipeId) continue; const row = grouped.get(item.recipeId) ?? { revenue: 0, cost: 0, quantity: 0 }; row.quantity += Number(item.quantitySold); row.cost += Number(item.totalCost); row.revenue += Number(item.quantitySold) * Number(item.sellingPriceSnapshot); grouped.set(item.recipeId, row); } const recipes: any[] = await this.prisma.restaurantRecipe.findMany({ where: { tenantId, id: { in: [...grouped.keys()] } }, select: { id: true, code: true, name: true } }); const names = new Map(recipes.map((recipe) => [recipe.id, recipe])); return { period: { start, end }, ...this.paginate([...grouped.entries()].map(([recipeId, row]) => ({ recipeId, recipe: names.get(recipeId) ?? null, quantitySold: Number(row.quantity.toFixed(6)), revenue: Number(row.revenue.toFixed(2)), cost: Number(row.cost.toFixed(2)), margin: Number((row.revenue - row.cost).toFixed(2)), marginPercent: row.revenue ? Number(((row.revenue - row.cost) / row.revenue * 100).toFixed(4)) : null })), query) }; }
  async recipeMargins(tenantId: string, query: CommercialQuery = {}) {
    await this.context(tenantId, query.branchId);
    const { start, end } = this.forecastPeriod(query);
    const records: any[] = await this.prisma.restaurantConsumptionRecord.findMany({ where: { tenantId, status: 'CONFIRMED', consumptionDate: { gte: start, lte: end }, ...(query.branchId ? { branchId: query.branchId } : {}) }, include: { items: true } });
    const recipeIds = [...new Set(records.flatMap((record) => record.items.map((item: any) => item.recipeId)).filter(Boolean))];
    const recipes: any[] = await this.prisma.restaurantRecipe.findMany({ where: { tenantId, id: { in: recipeIds }, ...(query.recipeId ? { id: query.recipeId } : {}), ...(query.categoryId ? { categoryId: query.categoryId } : {}), ...(query.status ? { status: query.status as any } : {}) }, select: { id: true, code: true, name: true, categoryId: true, type: true, status: true } });
    const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    const versions: any[] = await this.prisma.restaurantRecipeVersion.findMany({ where: { tenantId, recipeId: { in: recipes.map((recipe) => recipe.id) } }, include: { components: true }, orderBy: { versionNumber: 'asc' } });
    const versionsByRecipe = new Map<string, any[]>();
    for (const version of versions) versionsByRecipe.set(version.recipeId, [...(versionsByRecipe.get(version.recipeId) ?? []), version]);
    const grouped = new Map<string, any>();
    for (const record of records) for (const item of record.items) {
      const recipe = recipeMap.get(item.recipeId); if (!recipe) continue;
      const available = (versionsByRecipe.get(item.recipeId) ?? []).filter((version) => version.status === 'PUBLISHED' && (!version.publishedAt || new Date(version.publishedAt) <= new Date(record.consumptionDate)));
      const version = available.find((candidate) => candidate.versionNumber === item.recipeVersion) ?? available[available.length - 1] ?? (versionsByRecipe.get(item.recipeId) ?? []).find((candidate) => candidate.versionNumber === item.recipeVersion);
      const versionNumber = version?.versionNumber ?? item.recipeVersion ?? recipe.version ?? 0;
      const key = `${item.recipeId}:${versionNumber}`;
      const row = grouped.get(key) ?? { recipe, version, portionsSold: 0, revenue: 0, ingredientCost: 0, productionCost: 0, totalCost: 0, missingSellingPrice: false };
      const quantity = Number(item.quantitySold);
      const totalCost = Number(item.totalCost ?? (version?.portionCostSnapshot ?? item.unitCostSnapshot ?? 0) * quantity);
      const portions = Number(version?.portions ?? 1) || 1;
      const directIngredientBatchCost = (version?.components ?? []).filter((component: any) => component.componentType === 'INGREDIENT').reduce((sum: number, component: any) => sum + Number(component.totalCostSnapshot ?? 0), 0);
      const ingredientCost = version ? directIngredientBatchCost / portions * quantity : totalCost;
      const productionCost = Math.max(0, totalCost - ingredientCost);
      const sellingPrice = Number(item.sellingPriceSnapshot ?? version?.sellingPriceSnapshot ?? 0);
      row.portionsSold += quantity; row.revenue += quantity * sellingPrice; row.ingredientCost += ingredientCost; row.productionCost += productionCost; row.totalCost += totalCost; row.missingSellingPrice = row.missingSellingPrice || sellingPrice <= 0; row.version = version ?? row.version;
      grouped.set(key, row);
    }
    const rows = [...grouped.values()].map((row) => {
      const margin = row.revenue - row.totalCost;
      const marginStatus = row.missingSellingPrice ? 'MISSING_SELLING_PRICE' : margin < 0 ? 'NEGATIVE_MARGIN' : 'OK';
      return { recipe: row.recipe, period: { start, end }, portionsSold: Number(row.portionsSold.toFixed(6)), revenue: Number(row.revenue.toFixed(2)), ingredientCost: Number(row.ingredientCost.toFixed(2)), productionCost: Number(row.productionCost.toFixed(2)), totalCost: Number(row.totalCost.toFixed(2)), margin: Number(margin.toFixed(2)), marginPercent: row.revenue > 0 ? Number((margin / row.revenue * 100).toFixed(4)) : null, foodCost: row.revenue > 0 ? Number((row.totalCost / row.revenue * 100).toFixed(4)) : null, recipeVersionUsed: row.version ? { id: row.version.id, versionNumber: row.version.versionNumber, status: row.version.status, sellingPriceSnapshot: row.version.sellingPriceSnapshot } : null, status: marginStatus };
    });
    return { period: { start, end }, ...this.paginate(rows, query) };
  }
  async unitComparison(tenantId: string, query: CommercialQuery & { branchIds?: string[]; metric?: string; groupBy?: string; normalized?: boolean; sortOrder?: 'asc' | 'desc' } = {}, allowedBranchIds: string[] = [], isGlobal = false) {
    const requested = [...new Set(query.branchIds?.length ? query.branchIds : isGlobal ? [] : allowedBranchIds)];
    if (!isGlobal && query.branchIds?.some((branchId) => !allowedBranchIds.includes(branchId))) this.fail('Una o más sucursales están fuera del alcance del usuario', ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN);
    await Promise.all(requested.map((branchId) => this.context(tenantId, branchId)));
    const { start, end } = this.forecastPeriod(query);
    const metric = query.metric ?? 'consumption_cost';
    const validMetrics = ['purchase_cost', 'consumption_cost', 'food_cost_percent', 'waste_cost', 'shrinkage_cost', 'inventory_turnover', 'stockout_rate', 'recipe_margin', 'purchase_budget_utilization'];
    if (!validMetrics.includes(metric)) this.fail('Métrica de comparación no soportada', ErrorCode.VALIDATION_ERROR, HttpStatus.UNPROCESSABLE_ENTITY);
    const base = await this.branchCosts(tenantId, { ...query, branchIds: requested.length ? requested : undefined, page: 1, pageSize: 200 });
    let recipeByBranch = new Map<string, number>();
    if (metric === 'recipe_margin') {
      const branchIds = requested.length ? requested : base.rows.map((row: any) => row.branch.id);
      const values = await Promise.all(branchIds.map((branchId) => this.recipeMargins(tenantId, { ...query, branchId, page: 1, pageSize: 200 })));
      recipeByBranch = new Map(values.map((value: any, index) => [branchIds[index], value.rows.reduce((sum: number, row: any) => sum + Number(row.margin), 0)]));
    }
    let budgetByBranch = new Map<string, number>();
    if (metric === 'purchase_budget_utilization') {
      const budgets: any[] = await this.prisma.restaurantCommercialBudget.findMany({ where: { tenantId, status: { in: ['ACTIVE', 'CLOSED'] }, periodStart: { lte: end }, periodEnd: { gte: start }, ...(requested.length ? { branchId: { in: requested } } : {}) }, select: { branchId: true, budgetAmount: true } });
      for (const budget of budgets) budgetByBranch.set(budget.branchId, (budgetByBranch.get(budget.branchId) ?? 0) + Number(budget.budgetAmount));
    }
    let stockoutByBranch = new Map<string, number>();
    if (metric === 'stockout_rate') {
      const balances: any[] = await this.prisma.restaurantInventoryBalance.findMany({ where: { tenantId, ...(requested.length ? { branchId: { in: requested } } : {}) }, select: { branchId: true, quantityOnHand: true } });
      const counts = new Map<string, { total: number; out: number }>();
      for (const balance of balances) { const item = counts.get(balance.branchId) ?? { total: 0, out: 0 }; item.total += 1; if (Number(balance.quantityOnHand) <= 0) item.out += 1; counts.set(balance.branchId, item); }
      stockoutByBranch = new Map([...counts.entries()].map(([branchId, count]) => [branchId, count.total ? count.out / count.total * 100 : 0]));
    }
    const days = Math.max(1, (end.getTime() - start.getTime()) / 86400000);
    const rawRows: any[] = base.rows.map((row: any) => {
      const branchId = row.branch.id;
      const values: Record<string, number | null> = {
        purchase_cost: row.purchasesConfirmed,
        consumption_cost: row.consumptionCost,
        food_cost_percent: row.foodCostPercent,
        waste_cost: row.wasteCost,
        shrinkage_cost: row.wasteCost + Math.abs(row.theoreticalRealVariance),
        inventory_turnover: row.inventoryValue ? row.consumptionCost / row.inventoryValue * (365 / days) : null,
        stockout_rate: stockoutByBranch.get(branchId) ?? 0,
        recipe_margin: recipeByBranch.get(branchId) ?? 0,
        purchase_budget_utilization: budgetByBranch.get(branchId) ? row.purchasesConfirmed / budgetByBranch.get(branchId)! * 100 : null,
      };
      const rawValue = values[metric];
      const isSalesNormalized = ['purchase_cost', 'consumption_cost', 'waste_cost', 'shrinkage_cost', 'recipe_margin'].includes(metric);
      const denominator = isSalesNormalized ? row.salesRevenue : metric === 'inventory_turnover' ? days : null;
      const value = query.normalized && rawValue !== null && denominator ? rawValue / denominator * (isSalesNormalized ? 100 : 1) : rawValue;
      const priorKey = metric === 'purchase_cost' ? 'purchasesConfirmed' : metric === 'consumption_cost' ? 'consumptionCost' : metric === 'food_cost_percent' ? 'foodCostPercent' : metric === 'waste_cost' ? 'wasteCost' : undefined;
      return { metric, unit: row.branch, period: { start, end }, value: value === null ? null : Number(Number(value).toFixed(4)), rawValue, ranking: 0, changeVsPreviousPeriod: priorKey ? row.changeVsPreviousPeriod?.[priorKey] ?? null : null, networkAverage: null, standardDeviation: null, normalized: Boolean(query.normalized), normalization: denominator ? { basis: isSalesNormalized ? 'sales' : 'operating_days', denominator: Number(Number(denominator).toFixed(6)), formula: isSalesNormalized ? 'metric / confirmed_sales * 100' : 'metric / operating_days' } : { basis: 'none', denominator: null, formula: 'not_applicable' } };
    });
    const numeric = rawRows.map((row) => row.value).filter((value): value is number => value !== null);
    const average = numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null;
    const deviation = numeric.length ? Math.sqrt(numeric.reduce((sum, value) => sum + (value - average!) ** 2, 0) / numeric.length) : null;
    const sorted = [...rawRows].sort((left, right) => (right.value ?? Number.NEGATIVE_INFINITY) - (left.value ?? Number.NEGATIVE_INFINITY) || left.unit.name.localeCompare(right.unit.name));
    const descending = query.sortOrder !== 'asc';
    const ordered = descending ? sorted : [...sorted].reverse();
    ordered.forEach((row, index) => { row.ranking = index + 1; row.networkAverage = average === null ? null : Number(average.toFixed(4)); row.standardDeviation = deviation === null ? null : Number(deviation.toFixed(4)); });
    return { metric, groupBy: query.groupBy ?? 'branch', period: { start, end }, normalized: Boolean(query.normalized), rows: ordered, total: ordered.length };
  }
  async comparative(tenantId: string, query: CommercialQuery = {}) { const costs = await this.branchCosts(tenantId, query); const margins = await this.recipeMargins(tenantId, query); return { period: costs.period, branches: costs.rows, recipeMargins: margins.rows, page: costs.page, pageSize: costs.pageSize, total: costs.total, totalPages: costs.totalPages }; }
  async commissary(tenantId: string, query: CommercialQuery = {}) { await this.context(tenantId, query.branchId, query.warehouseId); const { start, end } = this.period(query); const transfers: any[] = await this.prisma.restaurantStockTransfer.findMany({ where: { tenantId, status: 'RECEIVED', receivedAt: { gte: start, lte: end }, ...(query.branchId ? { destinationBranchId: query.branchId } : {}), ...(query.warehouseId ? { destinationWarehouseId: query.warehouseId } : {}) }, include: { items: true } }); const total = transfers.reduce((sum, transfer) => sum + transfer.items.reduce((lineSum: number, item: any) => lineSum + Number(item.quantity) * Number(item.unitCost), 0), 0); return { period: { start, end }, transferCount: transfers.length, receivedValue: Number(total.toFixed(2)), transfers }; }
  private budgetPeriod(dto: any) {
    const start = new Date(dto.periodStart); const end = new Date(dto.periodEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) this.fail('El periodo del presupuesto es inválido', ErrorCode.VALIDATION_ERROR, HttpStatus.UNPROCESSABLE_ENTITY);
    return { start, end };
  }
  private async budgetScope(tenantId: string, branchId: string, warehouseId?: string, supplierId?: string, categoryId?: string) {
    await this.context(tenantId, branchId, warehouseId);
    if (supplierId) {
      const supplier = await this.prisma.restaurantInventorySupplier.findFirst({ where: { id: supplierId, tenantId, status: 'ACTIVE' }, select: { id: true } });
      if (!supplier) this.fail('Proveedor no encontrado en la empresa', ErrorCode.TENANT_ACCESS_DENIED, HttpStatus.FORBIDDEN);
    }
    if (categoryId) {
      const category = await this.prisma.restaurantInventoryCategory.findFirst({ where: { id: categoryId, tenantId, status: 'ACTIVE' }, select: { id: true } });
      if (!category) this.fail('Categoría no encontrada en la empresa', ErrorCode.TENANT_ACCESS_DENIED, HttpStatus.FORBIDDEN);
    }
  }
  private budgetView(budget: any) {
    const committed = Number(budget.committedAmount ?? 0); const received = Number(budget.receivedAmount ?? 0); const amount = Number(budget.budgetAmount ?? 0); const used = Math.max(committed, received);
    return { ...budget, budgetAmount: amount, committedAmount: committed, receivedAmount: received, remainingAmount: amount - used, usedAmount: used, utilizationPercent: amount ? Number((used / amount * 100).toFixed(4)) : 0 };
  }
  async createBudget(tenantId: string, userId: string, dto: any) {
    if (!dto.branchId || !dto.code || !dto.periodStart || !dto.periodEnd || dto.budgetAmount === undefined) this.fail('Sucursal, código, periodo e importe son obligatorios', ErrorCode.VALIDATION_ERROR, HttpStatus.UNPROCESSABLE_ENTITY);
    await this.budgetScope(tenantId, dto.branchId, dto.warehouseId, dto.supplierId, dto.categoryId);
    const { start, end } = this.budgetPeriod(dto); if (Number(dto.budgetAmount) < 0) this.fail('El presupuesto no puede ser negativo');
    const scopeWhere: any = { tenantId, branchId: dto.branchId, warehouseId: dto.warehouseId ?? null, categoryId: dto.categoryId ?? null, supplierId: dto.supplierId ?? null, periodStart: start, periodEnd: end };
    try {
      const created = await this.prisma.$transaction(async (tx: any) => {
        const duplicate = await tx.restaurantCommercialBudget.findFirst({ where: scopeWhere, select: { id: true } });
        if (duplicate) this.fail('Ya existe un presupuesto para el mismo periodo y alcance', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT);
        return tx.restaurantCommercialBudget.create({ data: { ...scopeWhere, code: dto.code.trim().toUpperCase(), budgetAmount: dto.budgetAmount, overagePolicy: dto.overagePolicy ?? RestaurantCommercialBudgetOveragePolicy.BLOCK, reason: dto.reason, notes: dto.notes, createdBy: userId } });
      });
      return this.budgetView(created);
    } catch (error: any) { if (error?.code === 'P2002') this.fail('El código o alcance del presupuesto ya existe', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT); throw error; }
  }
  async budgets(tenantId: string, query: CommercialQuery & { status?: string; supplierId?: string; categoryId?: string } = {}) {
    await this.context(tenantId, query.branchId, query.warehouseId);
    const rows = await this.prisma.restaurantCommercialBudget.findMany({ where: { tenantId, ...(query.branchId ? { branchId: query.branchId } : {}), ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}), ...(query.status ? { status: query.status as any } : {}), ...(query.categoryId ? { categoryId: query.categoryId } : {}), ...(query.supplierId ? { supplierId: query.supplierId } : {}) }, orderBy: { periodStart: 'desc' } });
    const branchIds = [...new Set(rows.map((row) => row.branchId))];
    const branches: any[] = await this.prisma.branch.findMany({ where: { tenantId, id: { in: branchIds } }, select: { id: true, name: true } });
    const names = new Map(branches.map((branch) => [branch.id, branch.name]));
    return { rows: rows.map((row) => ({ ...this.budgetView(row), branchName: names.get(row.branchId) ?? row.branchId })), total: rows.length };
  }
  async updateBudget(tenantId: string, userId: string, id: string, dto: any) {
    const budget: any = await this.prisma.restaurantCommercialBudget.findFirst({ where: { id, tenantId } }); if (!budget) this.fail('Presupuesto no encontrado', ErrorCode.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (![RestaurantCommercialBudgetStatus.DRAFT, RestaurantCommercialBudgetStatus.PENDING_APPROVAL].includes(budget.status)) this.fail('El presupuesto no puede modificarse en su estado actual', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT);
    const branchId = dto.branchId ?? budget.branchId; const warehouseId = dto.warehouseId !== undefined ? dto.warehouseId : budget.warehouseId; const categoryId = dto.categoryId !== undefined ? dto.categoryId : budget.categoryId; const supplierId = dto.supplierId !== undefined ? dto.supplierId : budget.supplierId;
    await this.budgetScope(tenantId, branchId, warehouseId, supplierId, categoryId);
    const { start, end } = dto.periodStart || dto.periodEnd ? this.budgetPeriod({ periodStart: dto.periodStart ?? budget.periodStart, periodEnd: dto.periodEnd ?? budget.periodEnd }) : { start: budget.periodStart, end: budget.periodEnd };
    const data: any = { branchId, warehouseId, categoryId, supplierId, periodStart: start, periodEnd: end, ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}), ...(dto.budgetAmount !== undefined ? { budgetAmount: dto.budgetAmount } : {}), ...(dto.overagePolicy !== undefined ? { overagePolicy: dto.overagePolicy } : {}), ...(dto.reason !== undefined ? { reason: dto.reason } : {}), ...(dto.notes !== undefined ? { notes: dto.notes } : {}), ...(dto.status !== undefined ? { status: dto.status } : {}), updatedAt: new Date() };
    try { return this.budgetView(await this.prisma.restaurantCommercialBudget.update({ where: { id }, data })); } catch (error: any) { if (error?.code === 'P2002') this.fail('El código o alcance del presupuesto ya existe', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT); throw error; }
  }
  async approveBudget(tenantId: string, userId: string, id: string) { return this.transitionBudget(tenantId, userId, id, 'APPROVE'); }
  async closeBudget(tenantId: string, userId: string, id: string) { return this.transitionBudget(tenantId, userId, id, 'CLOSE'); }
  private async transitionBudget(tenantId: string, userId: string, id: string, action: 'APPROVE' | 'CLOSE') {
    return this.prisma.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "RestaurantCommercialBudget" WHERE "id" = $1 AND "tenantId" = $2 FOR UPDATE', id, tenantId);
      const current: any = await tx.restaurantCommercialBudget.findFirst({ where: { id, tenantId } }); if (!current) this.fail('Presupuesto no encontrado', ErrorCode.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
      if (action === 'APPROVE' && ['APPROVED', 'ACTIVE'].includes(current.status)) return this.budgetView(current);
      if (action === 'CLOSE' && current.status === 'CLOSED') return this.budgetView(current);
      if (action === 'APPROVE' && !['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(current.status)) this.fail('El presupuesto no puede aprobarse en su estado actual', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT);
      if (action === 'CLOSE' && !['APPROVED', 'ACTIVE'].includes(current.status)) this.fail('El presupuesto no puede cerrarse en su estado actual', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT);
      const updated = await tx.restaurantCommercialBudget.update({ where: { id }, data: action === 'APPROVE' ? { status: 'APPROVED', approvedBy: userId, approvedAt: new Date() } : { status: 'CLOSED', closedBy: userId, closedAt: new Date() } });
      return this.budgetView(updated);
    });
  }
  async assertOrderWithinBudgetTx(tx: any, tenantId: string, order: any) {
    const ingredientIds = order.lines.map((line: any) => line.ingredientId);
    const ingredients: any[] = await tx.restaurantIngredient.findMany({ where: { tenantId, id: { in: ingredientIds } }, select: { id: true, categoryId: true } });
    const categoryByIngredient = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.categoryId]));
    const budgets: any[] = await tx.restaurantCommercialBudget.findMany({ where: { tenantId, branchId: order.branchId, OR: [{ warehouseId: null }, { warehouseId: order.warehouseId }], status: { in: ['APPROVED', 'ACTIVE'] }, periodStart: { lte: order.createdAt }, periodEnd: { gte: order.createdAt } }, orderBy: { categoryId: 'asc' } });
    for (const budget of budgets) {
      const matching = order.lines.filter((line: any) => !budget.categoryId || categoryByIngredient.get(line.ingredientId) === budget.categoryId);
      if (budget.supplierId && budget.supplierId !== order.supplierId || !matching.length) continue;
      const projected = Number(budget.committedAmount) + matching.reduce((sum: number, line: any) => sum + Number(line.totalAmount), 0);
      if (budget.overagePolicy === 'BLOCK' && projected > Number(budget.budgetAmount)) this.fail('La orden supera el presupuesto aprobado', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT);
      if (budget.overagePolicy === 'REQUIRE_APPROVAL' && order.status !== 'PENDING_APPROVAL') this.fail('La orden requiere aprobación por sobrepresupuesto', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT);
    }
  }
  async refreshBudgetsForOrderTx(tx: any, tenantId: string, order: any) {
    const budgets: any[] = await tx.restaurantCommercialBudget.findMany({ where: { tenantId, branchId: order.branchId, periodStart: { lte: order.createdAt }, periodEnd: { gte: order.createdAt }, OR: [{ warehouseId: null }, { warehouseId: order.warehouseId }] } });
    for (const budget of budgets) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "RestaurantCommercialBudget" WHERE "id" = $1 FOR UPDATE', budget.id);
      const [orders, receipts] = await Promise.all([
        tx.restaurantPurchaseOrder.findMany({ where: { tenantId, branchId: order.branchId, warehouseId: budget.warehouseId ? order.warehouseId : undefined, supplierId: budget.supplierId ?? undefined, status: { in: ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED'] }, createdAt: { gte: budget.periodStart, lte: budget.periodEnd } }, include: { lines: true } }),
        tx.restaurantGoodsReceipt.findMany({ where: { tenantId, branchId: order.branchId, warehouseId: budget.warehouseId ? order.warehouseId : undefined, supplierId: budget.supplierId ?? undefined, status: 'CONFIRMED', receivedAt: { gte: budget.periodStart, lte: budget.periodEnd } }, include: { items: true } }),
      ]);
      const ids = [...new Set([...orders.flatMap((po: any) => po.lines.map((line: any) => line.ingredientId)), ...receipts.flatMap((receipt: any) => receipt.items.map((item: any) => item.ingredientId))])];
      const categoryRows: any[] = await tx.restaurantIngredient.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, categoryId: true } });
      const categories = new Map(categoryRows.map((ingredient) => [ingredient.id, ingredient.categoryId]));
      const matches = (line: any) => !budget.categoryId || categories.get(line.ingredientId) === budget.categoryId;
      const committed = orders.reduce((sum: number, po: any) => sum + po.lines.filter(matches).reduce((x: number, line: any) => x + Number(line.totalAmount), 0), 0);
      const received = receipts.reduce((sum: number, receipt: any) => sum + receipt.items.filter(matches).reduce((x: number, item: any) => x + Number(item.totalCost), 0), 0);
      await tx.restaurantCommercialBudget.update({ where: { id: budget.id }, data: { committedAmount: committed, receivedAmount: received } });
    }
  }
}
