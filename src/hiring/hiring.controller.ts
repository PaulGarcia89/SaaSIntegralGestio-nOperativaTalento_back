import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ModuleCode } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { HiringService } from './hiring.service';
import { CancelHiringContractDto, ConfigureHiringOfferDto, CreateHiringContractDto, ListHiringContractsDto, RequestHiringDocumentsDto, ReviewHiringDocumentDto, UpdateHiringContractDto } from './dto/hiring.dto';
import { RequestLocale } from '../common/decorators/request-locale.decorator';
import { SupportedLocale } from '../localization/localization.service';

@Controller('hiring')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, ScopeGuard, PermissionGuard)
@RequireModule(ModuleCode.ATS)
export class HiringController {
  constructor(private readonly service: HiringService) {}

  @Post('applications/:applicationId')
  @RequirePermissions('applications.update')
  create(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('applicationId') applicationId: string, @Body() dto: CreateHiringContractDto) { return this.service.create(request.tenant!.id, actor, applicationId, dto, request.requestId); }

  @Get()
  @RequirePermissions('applications.read')
  list(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Query() query: ListHiringContractsDto) { return this.service.list(request.tenant!.id, actor, query); }

  @Get(':id')
  @RequirePermissions('applications.read')
  detail(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string) { return this.service.detail(request.tenant!.id, actor, id); }

  @Patch(':id')
  @RequirePermissions('applications.update')
  update(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body() dto: UpdateHiringContractDto) { return this.service.updateDraft(request.tenant!.id, actor, id, dto, request.requestId); }

  @Post(':id/offer')
  @RequirePermissions('applications.update')
  configureOffer(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body() dto: ConfigureHiringOfferDto) { return this.service.configureOffer(request.tenant!.id, actor, id, dto); }

  @Post(':id/offer/send')
  @RequirePermissions('applications.update')
  sendOffer(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string) { return this.service.sendOffer(request.tenant!.id, actor, id, request.requestId); }

  @Post(':id/offer/respond')
  @RequirePermissions('applications.update')
  respondOffer(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body() body: { accepted: boolean; reason?: string }) { return this.service.respondOffer(request.tenant!.id, actor, id, Boolean(body.accepted), body.reason); }

  @Post(':id/documents')
  @RequirePermissions('applications.update')
  requestDocument(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body() dto: RequestHiringDocumentsDto) { return this.service.requestDocuments(request.tenant!.id, actor, id, dto, request.requestId); }

  @Get(':id/documents')
  @RequirePermissions('applications.read')
  documents(@Req() request: RequestWithUser, @Param('id') id: string) { return this.service.listDocuments(request.tenant!.id, id); }

  @Post(':id/documents/send')
  @RequirePermissions('applications.update')
  sendDocuments(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string) { return this.service.sendDocuments(request.tenant!.id, actor, id, request.requestId); }

  @Patch(':id/documents/:documentId')
  @RequirePermissions('applications.update')
  reviewDocument(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Param('documentId') documentId: string, @Body() dto: ReviewHiringDocumentDto) { return this.service.reviewDocument(request.tenant!.id, actor, id, documentId, dto); }

  @Get(':id/progress')
  @RequirePermissions('applications.read')
  progress(@Req() request: RequestWithUser, @Param('id') id: string, @RequestLocale() locale: SupportedLocale) { return this.service.calculateProgress(request.tenant!.id, id, locale); }

  @Post(':id/confirm')
  @RequirePermissions('applications.update')
  confirm(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string) { return this.service.confirm(request.tenant!.id, actor, id, request.requestId); }

  @Post(':id/cancel')
  @RequirePermissions('applications.update')
  cancel(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body() dto: CancelHiringContractDto) { return this.service.cancel(request.tenant!.id, actor, id, dto, request.requestId); }

  @Get(':id/history')
  @RequirePermissions('applications.read')
  history(@Req() request: RequestWithUser, @Param('id') id: string) { return this.service.history(request.tenant!.id, id); }
}
