import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ModuleCode } from "@prisma/client";
import { Request as ExpressRequest } from "express";
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
import { CommunicationGovernanceService } from "./communication-governance.service";
import { ComposeCandidateEmailDto, ConfigureCommunicationDomainDto, LinkInboundEmailDto, ListAtsConversationsDto, ReplyCandidateEmailDto, ResolveInboundEmailDto, UpdateAtsConversationDto } from "./dto/communication-governance.dto";
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
  constructor(private readonly communications: AtsCommunicationsService, private readonly governance: CommunicationGovernanceService) {}

  @Get("domain")
  @RequirePermissions("applications.read")
  domain(@Req() request: RequestWithUser) { return this.governance.getDomain(request.tenant!.id); }

  @Put("domain")
  @RequirePermissions("vacancies.update")
  configureDomain(@Req() request: RequestWithUser, @Body() dto: ConfigureCommunicationDomainDto) { return this.governance.configureDomain(request.tenant!.id, dto); }

  @Post("domain/verify")
  @RequirePermissions("vacancies.update")
  verifyDomain(@Req() request: RequestWithUser) { return this.governance.verifyDomain(request.tenant!.id); }

  @Get("inbox")
  @RequirePermissions("applications.read")
  inbox(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Query("page") page?: string, @Query("pageSize") pageSize?: string, @Query("search") search?: string) { return this.governance.inbox(request.tenant!.id, actor, Number(page ?? 1), Number(pageSize ?? 30), search); }

  @Get("conversations")
  @RequirePermissions("applications.read")
  conversations(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Query() query: ListAtsConversationsDto) { return this.governance.conversations(request.tenant!.id, actor, query); }

  @Get("conversations/:id")
  @RequirePermissions("applications.read")
  conversation(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string) { return this.governance.conversation(request.tenant!.id, actor, id); }

  @Patch("conversations/:id")
  @RequirePermissions("applications.update")
  updateConversation(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string, @Body() dto: UpdateAtsConversationDto) { return this.governance.updateConversation(request.tenant!.id, actor, id, dto); }

  @Post("conversations/:id/read")
  @RequirePermissions("applications.read")
  markRead(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string) { return this.governance.markRead(request.tenant!.id, actor, id); }

  @Post("applications/:applicationId/messages")
  @RequirePermissions("applications.update")
  compose(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("applicationId") applicationId: string, @Body() dto: ComposeCandidateEmailDto) { return this.governance.compose(request.tenant!.id, actor, applicationId, dto); }

  @Get("unmatched")
  @RequirePermissions("applications.read")
  unmatched(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Query("page") page?: string, @Query("pageSize") pageSize?: string) { return this.governance.unmatched(request.tenant!.id, actor, Number(page ?? 1), Number(pageSize ?? 20)); }

  @Post("unmatched/:id/link")
  @RequirePermissions("applications.update")
  linkUnmatched(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string, @Body() dto: LinkInboundEmailDto) { return this.governance.linkUnmatched(request.tenant!.id, actor, id, dto); }

  @Post("unmatched/:id/ignore")
  @RequirePermissions("applications.update")
  ignoreUnmatched(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string, @Body() dto: ResolveInboundEmailDto) { return this.governance.ignoreUnmatched(request.tenant!.id, actor, id, dto); }

  @Get("attachments/:id/access")
  @RequirePermissions("applications.files.read")
  attachment(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string) { return this.governance.attachmentAccess(request.tenant!.id, actor, id); }

  @Post("messages/:id/reply")
  @RequirePermissions("applications.update")
  reply(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string, @Body() dto: ReplyCandidateEmailDto) { return this.governance.reply(request.tenant!.id, actor, id, dto); }

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

@Controller("webhooks/communications")
export class CommunicationWebhooksController {
  constructor(private readonly governance: CommunicationGovernanceService) {}

  @Post("resend")
  resend(@Headers() headers: Record<string, string | string[] | undefined>, @Req() request: ExpressRequest & { rawBody?: Buffer }, @Body() body: Record<string, unknown>) {
    return this.governance.processResendEvent(headers, body, request.rawBody ?? Buffer.from(JSON.stringify(body)));
  }
}
