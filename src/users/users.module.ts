import { Module } from '@nestjs/common';
import { GlobalUsersController, UsersController } from './users.controller';
import { UsersService } from './users.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  controllers: [GlobalUsersController, UsersController],
  providers: [UsersService, TenantGuard, SubscriptionGuard, ModuleAccessGuard, PermissionGuard],
  exports: [UsersService],
})
export class UsersModule {}
