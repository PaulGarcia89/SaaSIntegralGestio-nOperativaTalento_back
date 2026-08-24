import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

export interface RestaurantReportFilters { branchId?: string; warehouseId?: string; ingredientId?: string; recipeId?: string; supplierId?: string; from?: string; to?: string; page?: number; pageSize?: number; }

@Injectable()
export class RestaurantReportsService {
  constructor(private readonly prisma: PrismaService) {}
  private scope(tenantId: string, f: RestaurantReportFilters) { return { tenantId, ...(f.branchId ? { branchId: f.branchId } : {}), ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}) }; }
  private period(f: RestaurantReportFilters) { return f.from || f.to ? { gte: f.from ? new Date(f.from) : undefined, lte: f.to ? new Date(f.to) : undefined } : undefined; }
  private page(f: RestaurantReportFilters) { const page = Math.max(1, Number(f.page) || 1); const pageSize = Math.min(200, Math.max(1, Number(f.pageSize) || 50)); return { page, pageSize, skip: (page - 1) * pageSize }; }
  async report(tenantId: string, type: string, f: RestaurantReportFilters) {
    const scope = this.scope(tenantId, f); const period = this.period(f); const p = this.page(f);
    switch (type) {
      case 'valued-stock': { const rows = await this.prisma.restaurantInventoryBalance.findMany({ where: { ...scope, ...(f.ingredientId ? { ingredientId: f.ingredientId } : {}) }, skip: p.skip, take: p.pageSize, orderBy: { updatedAt: 'desc' } }); return this.paginate(rows.map((r) => ({ ...r, value: Number(r.quantityOnHand) * Number(r.averageCost) })), p, rows.length); }
      case 'kardex': return this.prisma.restaurantInventoryMovement.findMany({ where: { ...scope, ...(f.ingredientId ? { ingredientId: f.ingredientId } : {}), ...(period ? { occurredAt: period } : {}) }, skip: p.skip, take: p.pageSize, orderBy: { occurredAt: 'desc' } });
      case 'receipts-by-supplier': return this.prisma.restaurantGoodsReceipt.findMany({ where: { ...scope, ...(f.supplierId ? { supplierId: f.supplierId } : {}), ...(period ? { receivedAt: period } : {}) }, skip: p.skip, take: p.pageSize, orderBy: { receivedAt: 'desc' }, include: { items: true } });
      case 'expiry': return this.prisma.restaurantInventoryLot.findMany({ where: { ...scope, remainingQuantity: { gt: 0 }, ...(f.ingredientId ? { ingredientId: f.ingredientId } : {}) }, skip: p.skip, take: p.pageSize, orderBy: { expirationDate: 'asc' } });
      case 'low-stock': { const ingredients = await this.prisma.restaurantIngredient.findMany({ where: { tenantId, ...(f.ingredientId ? { id: f.ingredientId } : {}) } }); const balances = await this.prisma.restaurantInventoryBalance.findMany({ where: scope }); return ingredients.map((i) => ({ ingredient: i, quantity: balances.filter((b) => b.ingredientId === i.id).reduce((n, b) => n + Number(b.quantityOnHand), 0) })).filter((r) => r.quantity <= Number(r.ingredient.minimumStock)); }
      case 'consumption-by-recipe': return this.prisma.restaurantConsumptionRecord.findMany({ where: { ...scope, ...(period ? { consumptionDate: period } : {}) }, include: { items: true }, skip: p.skip, take: p.pageSize, orderBy: { consumptionDate: 'desc' } });
      case 'waste-by-reason': return this.prisma.restaurantWasteRecord.findMany({ where: { ...scope, ...(period ? { wasteDate: period } : {}) }, include: { items: true }, skip: p.skip, take: p.pageSize, orderBy: { wasteDate: 'desc' } });
      case 'count-variances': return this.prisma.restaurantStockCount.findMany({ where: { ...scope, ...(period ? { countedAt: period } : {}) }, include: { items: true }, skip: p.skip, take: p.pageSize, orderBy: { countedAt: 'desc' } });
      case 'purchase-suggestions': return this.purchaseSuggestions(tenantId, f);
      case 'audit': return this.prisma.auditLog.findMany({ where: { tenantId, ...(period ? { createdAt: period } : {}), action: { contains: 'INVENTORY' } }, skip: p.skip, take: p.pageSize, orderBy: { createdAt: 'desc' } });
      default: throw new BadRequestException(`Unknown restaurant report: ${type}`);
    }
  }
  private async purchaseSuggestions(tenantId: string, f: RestaurantReportFilters) { const ingredients = await this.prisma.restaurantIngredient.findMany({ where: { tenantId } }); const balances = await this.prisma.restaurantInventoryBalance.findMany({ where: this.scope(tenantId, f) }); const movements = await this.prisma.restaurantInventoryMovement.findMany({ where: { ...this.scope(tenantId, f), movementType: 'CONSUMPTION', ...(this.period(f) ? { occurredAt: this.period(f) } : {}) } }); return ingredients.map((i) => { const stock = balances.filter((b) => b.ingredientId === i.id).reduce((n, b) => n + Number(b.quantityOnHand), 0); const consumed = movements.filter((m) => m.ingredientId === i.id).reduce((n, m) => n + Number(m.quantity), 0); const averageDaily = consumed / Math.max(1, Number(f.pageSize) || 30); return { ingredientId: i.id, name: i.name, currentStock: stock, minimumStock: Number(i.minimumStock), averageDailyConsumption: averageDaily, suggestedPurchase: Math.max(0, Number(i.minimumStock) - stock) }; }).filter((r) => r.suggestedPurchase > 0); }
  async exportCsv(tenantId: string, actorId: string, type: string, f: RestaurantReportFilters) { const data = await this.report(tenantId, type, { ...f, page: 1, pageSize: 200 }); const rows = Array.isArray(data) ? data : (data as any).data ?? []; const keys = rows.length ? Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object') : ['result']; const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`; return { filename: `inventario-${type}.csv`, mimeType: 'text/csv;charset=utf-8', generatedBy: actorId, content: `\uFEFF${[keys, ...rows.map((r: any) => keys.map((k) => cell(r[k])))].map((r) => r.join(',')).join('\r\n')}` }; }
  private paginate(data: unknown[], p: { page: number; pageSize: number }, sourceLength: number) { return { data, page: p.page, pageSize: p.pageSize, total: sourceLength, totalPages: Math.ceil(sourceLength / p.pageSize) }; }
}
