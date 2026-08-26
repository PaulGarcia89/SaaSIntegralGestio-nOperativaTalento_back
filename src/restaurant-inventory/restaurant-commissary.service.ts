import { HttpStatus, Injectable } from '@nestjs/common';
import { RestaurantCommissaryStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-code.enum';

@Injectable()
export class RestaurantCommissaryService {
  constructor(private readonly prisma: PrismaService) {}

  private fail(message: string, code = ErrorCode.BAD_REQUEST, status = HttpStatus.BAD_REQUEST): never {
    throw new AppException(message, code, status);
  }

  private unique(values?: string[]) { return [...new Set(values ?? [])]; }

  private async validateReferences(tenantId: string, data: any) {
    const servedBranchIds = this.unique(data.servedBranchIds);
    const ingredientIds = this.unique(data.ingredientIds);
    const recipeIds = this.unique(data.recipeIds);
    if (!data.centralBranchId && !data.centralWarehouseId) this.fail('Debe indicar una sucursal o almacén central');
    if (!servedBranchIds.length) this.fail('Debe indicar al menos una sucursal atendida');
    if (Number(data.productionCapacity) <= 0) this.fail('La capacidad de producción debe ser mayor que cero');

    if (data.centralBranchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: data.centralBranchId, tenantId }, select: { id: true } });
      if (!branch) this.fail('La sucursal central no pertenece a la empresa', ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN);
    }
    let warehouseBranchId: string | null = null;
    if (data.centralWarehouseId) {
      const warehouse = await this.prisma.restaurantInventoryWarehouse.findFirst({ where: { id: data.centralWarehouseId, tenantId }, select: { id: true, branchId: true } });
      if (!warehouse) this.fail('El almacén central no pertenece a la empresa', ErrorCode.TENANT_ACCESS_DENIED, HttpStatus.FORBIDDEN);
      warehouseBranchId = warehouse!.branchId;
      if (data.centralBranchId && warehouseBranchId !== data.centralBranchId) this.fail('El almacén central no pertenece a la sucursal central', ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN);
    }
    const branches = await this.prisma.branch.findMany({ where: { tenantId, id: { in: servedBranchIds } }, select: { id: true } });
    if (branches.length !== servedBranchIds.length) this.fail('Una sucursal atendida no pertenece a la empresa', ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN);
    if (ingredientIds.length) {
      const ingredients = await this.prisma.restaurantIngredient.findMany({ where: { tenantId, id: { in: ingredientIds }, status: 'ACTIVE' }, select: { id: true } });
      if (ingredients.length !== ingredientIds.length) this.fail('Un ingrediente permitido no pertenece a la empresa o está inactivo', ErrorCode.TENANT_ACCESS_DENIED, HttpStatus.FORBIDDEN);
    }
    if (recipeIds.length) {
      const recipes = await this.prisma.restaurantRecipe.findMany({ where: { tenantId, id: { in: recipeIds }, status: 'ACTIVE' }, select: { id: true } });
      if (recipes.length !== recipeIds.length) this.fail('Una receta producida no pertenece a la empresa o está inactiva', ErrorCode.TENANT_ACCESS_DENIED, HttpStatus.FORBIDDEN);
    }
    return { servedBranchIds, ingredientIds, recipeIds, warehouseBranchId };
  }

  private include() { return { servedBranches: true, allowedIngredients: true, producedRecipes: true }; }

  async list(tenantId: string, query: any = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 50));
    const where: any = { tenantId, ...(query.status ? { status: query.status } : {}), ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { code: { contains: query.search, mode: 'insensitive' } }] } : {}), ...(query.branchId ? { servedBranches: { some: { branchId: query.branchId } } } : {}) };
    const [rows, total] = await Promise.all([this.prisma.restaurantCommissary.findMany({ where, include: this.include(), orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }), this.prisma.restaurantCommissary.count({ where })]);
    return { rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async create(tenantId: string, userId: string, dto: any) {
    const refs = await this.validateReferences(tenantId, dto);
    try {
      return await this.prisma.$transaction((tx: any) => tx.restaurantCommissary.create({ data: { tenantId, name: dto.name.trim(), code: dto.code.trim().toUpperCase(), centralBranchId: dto.centralBranchId, centralWarehouseId: dto.centralWarehouseId, productionCapacity: dto.productionCapacity, productionCalendar: dto.productionCalendar, createdBy: userId, servedBranches: { create: refs.servedBranchIds.map((branchId) => ({ tenantId, branchId })) }, allowedIngredients: { create: refs.ingredientIds.map((ingredientId) => ({ tenantId, ingredientId })) }, producedRecipes: { create: refs.recipeIds.map((recipeId) => ({ tenantId, recipeId })) } }, include: this.include() }));
    } catch (error: any) {
      if (error?.code === 'P2002') this.fail('El código de comisariato ya existe en la empresa', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT);
      throw error;
    }
  }

  async update(tenantId: string, userId: string, id: string, dto: any) {
    const current: any = await this.prisma.restaurantCommissary.findFirst({ where: { id, tenantId }, include: this.include() });
    if (!current) this.fail('Comisariato no encontrado', ErrorCode.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    const data = { centralBranchId: dto.centralBranchId ?? current.centralBranchId, centralWarehouseId: dto.centralWarehouseId ?? current.centralWarehouseId, servedBranchIds: dto.servedBranchIds ?? current.servedBranches.map((item: any) => item.branchId), ingredientIds: dto.ingredientIds ?? current.allowedIngredients.map((item: any) => item.ingredientId), recipeIds: dto.recipeIds ?? current.producedRecipes.map((item: any) => item.recipeId), productionCapacity: dto.productionCapacity ?? current.productionCapacity };
    const refs = await this.validateReferences(tenantId, data);
    try {
      return await this.prisma.$transaction(async (tx: any) => {
        await tx.restaurantCommissaryBranch.deleteMany({ where: { tenantId, commissaryId: id } });
        await tx.restaurantCommissaryIngredient.deleteMany({ where: { tenantId, commissaryId: id } });
        await tx.restaurantCommissaryRecipe.deleteMany({ where: { tenantId, commissaryId: id } });
        return tx.restaurantCommissary.update({ where: { id }, data: { name: dto.name?.trim(), code: dto.code?.trim().toUpperCase(), centralBranchId: data.centralBranchId, centralWarehouseId: data.centralWarehouseId, productionCapacity: data.productionCapacity, productionCalendar: dto.productionCalendar, updatedBy: userId, servedBranches: { create: refs.servedBranchIds.map((branchId) => ({ tenantId, branchId })) }, allowedIngredients: { create: refs.ingredientIds.map((ingredientId) => ({ tenantId, ingredientId })) }, producedRecipes: { create: refs.recipeIds.map((recipeId) => ({ tenantId, recipeId })) } }, include: this.include() });
      });
    } catch (error: any) {
      if (error?.code === 'P2002') this.fail('El código de comisariato ya existe en la empresa', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT);
      throw error;
    }
  }

  async transition(tenantId: string, userId: string, id: string, status: RestaurantCommissaryStatus) {
    const current = await this.prisma.restaurantCommissary.findFirst({ where: { id, tenantId } });
    if (!current) this.fail('Comisariato no encontrado', ErrorCode.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (current!.status === status) return current;
    return this.prisma.restaurantCommissary.update({ where: { id }, data: { status, updatedBy: userId }, include: this.include() });
  }
}
