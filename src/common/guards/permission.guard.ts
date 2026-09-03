import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ANY_PERMISSIONS_KEY, REQUIRED_PERMISSIONS_KEY } from '../constants/auth.constants';
import { AccessScope } from '../enums/access-scope.enum';
import { RequestWithUser } from '../types/request-with-user.type';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-code.enum';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const anyPermissions = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if ((!requiredPermissions || requiredPermissions.length === 0) && (!anyPermissions || anyPermissions.length === 0)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (request.user?.role === 'SUPERADMIN' && request.user.isGlobalContext) {
      return true;
    }

    const ownedPermissions = new Set(request.user?.permissions ?? []);
    const allowLegacyInventoryPermissions = process.env.INVENTORY_LEGACY_PERMISSION_FALLBACK !== 'false';
    const hasPermission = (permission: string) => {
      if (ownedPermissions.has(permission)) return true;
      if (permission === 'inventory.read') return ownedPermissions.has('inventory.view');
      if (permission === 'inventory.view') return ownedPermissions.has('inventory.read');
      if (permission === 'inventory.create') return ownedPermissions.has('restaurant_inventory.manage');
      if (permission === 'inventory.update') return ownedPermissions.has('restaurant_inventory.manage');
      if (permission === 'inventory.confirm') return ownedPermissions.has('restaurant_inventory.manage');
      if (permission === 'inventory.cancel') return ownedPermissions.has('restaurant_inventory.manage');
      if (permission === 'inventory.report.view') return ownedPermissions.has('restaurant_inventory.manage');
      const legacyAliases: Record<string, string[]> = {
        'restaurant_inventory.receipts.create': ['restaurant_inventory.manage', 'inventory.create', 'inventory.manage'],
        'restaurant_inventory.receipts.confirm': ['restaurant_inventory.manage', 'inventory.confirm', 'inventory.manage'],
        'restaurant_inventory.recipes.manage': ['restaurant_inventory.manage', 'inventory.create', 'inventory.update', 'inventory.confirm', 'inventory.manage'],
        'restaurant_inventory.operations.create': ['restaurant_inventory.manage', 'inventory.create', 'inventory.manage'],
        'restaurant_inventory.operations.confirm': ['restaurant_inventory.manage', 'inventory.confirm', 'inventory.manage'],
        'restaurant_inventory.counts.approve': ['restaurant_inventory.manage', 'inventory.confirm', 'inventory.manage'],
        'restaurant_inventory.adjustments.create': ['restaurant_inventory.manage', 'inventory.update', 'inventory.manage'],
        'restaurant_inventory.transfers.manage': ['restaurant_inventory.manage', 'inventory.create', 'inventory.confirm', 'inventory.manage'],
        'restaurant_inventory.settings.manage': ['restaurant_inventory.manage', 'inventory.update', 'inventory.manage'],
        'restaurant_inventory.purchase_orders.create': ['restaurant_inventory.manage', 'inventory.create', 'inventory.manage'],
        'restaurant_inventory.purchase_orders.update': ['restaurant_inventory.manage', 'inventory.update', 'inventory.manage'],
        'restaurant_inventory.purchase_orders.submit': ['restaurant_inventory.manage', 'inventory.confirm', 'inventory.manage'],
        'restaurant_inventory.purchase_orders.approve': ['restaurant_inventory.manage', 'inventory.confirm', 'inventory.manage'],
        'restaurant_inventory.purchase_orders.reject': ['restaurant_inventory.manage', 'inventory.confirm', 'inventory.manage'],
        'restaurant_inventory.purchase_orders.cancel': ['restaurant_inventory.manage', 'inventory.cancel', 'inventory.manage'],
        'restaurant_inventory.purchase_orders.receive': ['restaurant_inventory.manage', 'inventory.confirm', 'inventory.manage'],
        'restaurant_inventory.price_history.view': ['restaurant_inventory.manage', 'inventory.read', 'inventory.manage'],
        'restaurant_inventory.purchase_suggestions.view': ['restaurant_inventory.manage', 'inventory.read', 'inventory.manage'],
        'restaurant_inventory.invoices.upload': ['restaurant_inventory.manage', 'inventory.create', 'inventory.manage'],
        'restaurant_inventory.invoices.process': ['restaurant_inventory.manage', 'inventory.confirm', 'inventory.manage'],
        'restaurant_inventory.invoices.reconcile': ['restaurant_inventory.manage', 'inventory.confirm', 'inventory.manage'],
        'restaurant_inventory.invoices.approve': ['restaurant_inventory.manage', 'inventory.confirm', 'inventory.manage'],
        'restaurant_inventory.variance.view': ['restaurant_inventory.manage', 'inventory.report.view', 'inventory.read', 'inventory.manage'],
        'restaurant_inventory.expiry_alerts.view': ['restaurant_inventory.manage', 'inventory.report.view', 'inventory.read', 'inventory.manage'],
        'restaurant_inventory.stock_counts.create': ['restaurant_inventory.manage', 'inventory.create', 'inventory.manage'],
        'restaurant_inventory.stock_counts.schedule': ['restaurant_inventory.manage', 'inventory.create', 'inventory.update', 'inventory.manage'],
        'restaurant_inventory.shrinkage.view': ['restaurant_inventory.manage', 'inventory.report.view', 'inventory.read', 'inventory.manage'],
        'restaurant_inventory.audit.view': ['restaurant_inventory.manage', 'inventory.report.view', 'inventory.read', 'inventory.manage'],
        'restaurant_inventory.audit.read': ['restaurant_inventory.manage', 'inventory.report.view', 'inventory.read', 'inventory.manage'],
        'restaurant_inventory.commercial.view': ['restaurant_inventory.manage', 'inventory.report.view', 'inventory.read', 'inventory.manage'],
        'restaurant_inventory.commissary.manage': ['restaurant_inventory.manage', 'inventory.create', 'inventory.confirm', 'inventory.manage'],
        'restaurant_inventory.budgets.manage': ['restaurant_inventory.manage', 'inventory.create', 'inventory.update', 'inventory.confirm', 'inventory.manage'],
      };
      return allowLegacyInventoryPermissions && (legacyAliases[permission] ?? []).some((alias) => ownedPermissions.has(alias));
    };
    const hasAllPermissions = (requiredPermissions ?? []).every(hasPermission);
    const hasAnyPermission = !anyPermissions || anyPermissions.some((permission) => ownedPermissions.has(permission));

    if (!hasAllPermissions || !hasAnyPermission) {
      throw new AppException(
        'User does not have the required permissions',
        ErrorCode.PERMISSION_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
