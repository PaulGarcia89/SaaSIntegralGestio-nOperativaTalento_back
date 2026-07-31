import { Module } from "@nestjs/common";
import { AtsCommunicationsController } from "./ats-communications.controller";
import { AtsCommunicationsService } from "./ats-communications.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { TenantGuard } from "../common/guards/tenant.guard";
import { SubscriptionGuard } from "../common/guards/subscription.guard";
import { ModuleAccessGuard } from "../common/guards/module-access.guard";
import { ScopeGuard } from "../common/guards/scope.guard";
import { PermissionGuard } from "../common/guards/permission.guard";

@Module({
  imports: [NotificationsModule],
  controllers: [AtsCommunicationsController],
  providers: [
    AtsCommunicationsService,
    TenantGuard,
    SubscriptionGuard,
    ModuleAccessGuard,
    ScopeGuard,
    PermissionGuard,
  ],
  exports: [AtsCommunicationsService],
})
export class AtsCommunicationsModule {}
