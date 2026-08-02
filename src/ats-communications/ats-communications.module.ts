import { Module } from "@nestjs/common";
import { AtsCommunicationsController, CommunicationWebhooksController } from "./ats-communications.controller";
import { AtsCommunicationsService } from "./ats-communications.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { TenantGuard } from "../common/guards/tenant.guard";
import { SubscriptionGuard } from "../common/guards/subscription.guard";
import { ModuleAccessGuard } from "../common/guards/module-access.guard";
import { ScopeGuard } from "../common/guards/scope.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { CommunicationGovernanceService } from "./communication-governance.service";

@Module({
  imports: [NotificationsModule],
  controllers: [AtsCommunicationsController, CommunicationWebhooksController],
  providers: [
    AtsCommunicationsService,
    CommunicationGovernanceService,
    TenantGuard,
    SubscriptionGuard,
    ModuleAccessGuard,
    ScopeGuard,
    PermissionGuard,
  ],
  exports: [AtsCommunicationsService],
})
export class AtsCommunicationsModule {}
