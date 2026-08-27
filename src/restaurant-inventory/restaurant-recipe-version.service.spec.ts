import { RestaurantRecipeVersionService } from './restaurant-recipe-version.service';
import { Prisma, RestaurantRecipeComponentType, RestaurantRecipeType, RestaurantRecipeVersionStatus } from '@prisma/client';

describe('RestaurantRecipeVersionService', () => {
  const unit = { id: 'unit-1', tenantId: null, type: 'WEIGHT', conversionFactor: 1, decimalPrecision: 3, status: 'ACTIVE' };
  const ingredient = { id: 'ingredient-1', tenantId: 'tenant-1', inventoryUnitId: 'unit-1', currentAverageCost: 2, status: 'ACTIVE' };
  const version = { id: 'version-1', recipeId: 'recipe-1', tenantId: 'tenant-1', yieldQuantity: new Prisma.Decimal(10), portions: new Prisma.Decimal(2), sellingPriceSnapshot: new Prisma.Decimal(8), recipe: { id: 'recipe-1', tenantId: 'tenant-1', type: RestaurantRecipeType.MENU_ITEM, outputIngredientId: null }, components: [{ id: 'component-1', componentType: RestaurantRecipeComponentType.INGREDIENT, ingredientId: 'ingredient-1', subRecipeId: null, quantity: new Prisma.Decimal(4), unitId: 'unit-1', quantityMode: 'GROSS', yieldPercentage: null, wastePercentage: null }] };

  it('rejects versions without components', async () => {
    const prisma: any = { restaurantRecipe: { findFirst: jest.fn().mockResolvedValue({ id: 'recipe-1', tenantId: 'tenant-1', status: 'DRAFT' }) }, restaurantRecipeVersion: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new RestaurantRecipeVersionService(prisma);
    await expect(service.createVersion('tenant-1', 'user-1', 'recipe-1', { yieldQuantity: 1, yieldUnitId: 'unit-1', components: [] })).rejects.toThrow('al menos un componente');
  });

  it('rejects a preparation without output ingredient', async () => {
    const prisma: any = { restaurantRecipeVersion: { findFirst: jest.fn().mockResolvedValue({ ...version, recipe: { ...version.recipe, type: RestaurantRecipeType.PREPARATION, outputIngredientId: null } }) } };
    const service = new RestaurantRecipeVersionService(prisma);
    await expect(service.validateVersion('tenant-1', 'recipe-1', 'version-1')).rejects.toThrow('outputIngredientId');
  });

  it('supersedes the previous publication atomically', async () => {
    const tx: any = { restaurantRecipeVersion: { updateMany: jest.fn(), update: jest.fn().mockResolvedValue({ id: 'version-1', status: RestaurantRecipeVersionStatus.PUBLISHED }) }, restaurantRecipe: { update: jest.fn() } };
    const prisma: any = {
      restaurantRecipeVersion: { findFirst: jest.fn().mockImplementation(({ where }: any) => where.id === 'version-1' ? Promise.resolve(version) : Promise.resolve({ ...version, id: 'old-version', status: RestaurantRecipeVersionStatus.PUBLISHED })) },
      restaurantIngredient: { findFirst: jest.fn().mockResolvedValue(ingredient) },
      restaurantInventoryUnit: { findFirst: jest.fn().mockResolvedValue(unit) },
      $transaction: jest.fn().mockImplementation((callback: any) => callback(tx)),
    };
    const service = new RestaurantRecipeVersionService(prisma);
    await service.publishVersion('tenant-1', 'user-1', 'recipe-1', 'version-1');
    expect(tx.restaurantRecipeVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: RestaurantRecipeVersionStatus.SUPERSEDED } }));
    expect(tx.restaurantRecipe.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'recipe-1' } }));
  });
});
