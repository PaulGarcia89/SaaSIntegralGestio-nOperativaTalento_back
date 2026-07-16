import { SetMetadata } from '@nestjs/common';
import { ROUTE_SCOPE_KEY } from '../constants/auth.constants';
import { RouteScope } from '../enums/route-scope.enum';

export const TenantScoped = () => SetMetadata(ROUTE_SCOPE_KEY, RouteScope.TENANT_WIDE);
