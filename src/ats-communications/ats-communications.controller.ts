import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ModuleCode } from "@prisma/client";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { SubscriptionGuard } from "../common/guards/subscription.guard";
import { ModuleAccessGuard } from "../common/guards/module-access.guard";
import { ScopeGuard } from "../common/guards/scope.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { RequireModule } from "../common/decorators/module-access.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequestWithUser } from "../common/types/request-with-user.type";
import { JwtPayload } from "../common/interfaces/jwt-payload.interface";
import { AtsCommunicationsService } from "./ats-communications.service";
import {
  CreateAtsCommunicationTemplateDto,
  SendOfferDto,
} from "./dto/ats-communication.dto";

@Controller("ats/communications")
@UseGuards(
  JwtAuthGuard,
  TenantGuard,
  SubscriptionGuard,
  ModuleAccessGuard,
  ScopeGuard,
  PermissionGuard,
)
@RequireModule(ModuleCode.ATS)
export class AtsCommunicationsController {
  constructor(private readonly communications: AtsCommunicationsService) {}

  @Get("templates")
  @RequirePermissions("applications.read")
  templates(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Query("vacancyId") vacancyId?: string,
  ) {
    return this.communications.listTemplates(
      request.tenant!.id,
      actor,
      vacancyId,
    );
  }

  @Post("templates")
  @RequirePermissions("vacancies.update")
  createTemplate(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Body() dto: CreateAtsCommunicationTemplateDto,
  ) {
    return this.communications.createTemplate(request.tenant!.id, actor, dto);
  }

  @Get("applications/:applicationId/history")
  @RequirePermissions("applications.read")
  history(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Param("applicationId") applicationId: string,
  ) {
    return this.communications.listHistory(
      request.tenant!.id,
      actor,
      applicationId,
    );
  }

  @Post("applications/:applicationId/offer")
  @RequirePermissions("applications.update")
  sendOffer(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Param("applicationId") applicationId: string,
    @Body() dto: SendOfferDto,
  ) {
    return this.communications.sendOffer(
      request.tenant!.id,
      actor,
      applicationId,
      dto,
    );
  }

  @Post("messages/:id/retry")
  @RequirePermissions("applications.update")
  retry(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
  ) {
    return this.communications.retryMessage(actor, request.tenant!.id, id);
  }
}
