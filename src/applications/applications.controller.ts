import { Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards, Body, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { BranchAccessGuard } from '../common/guards/branch-access.guard';
import { TenantWide } from '../common/decorators/tenant-wide.decorator';
import { BranchLocal } from '../common/decorators/branch-local.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentBranch } from '../common/decorators/current-branch.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { ApplicationsService } from './applications.service';
import { ListApplicationsDto } from './dto/list-applications.dto';
import { DecideApplicationTransitionDto, UndoApplicationTransitionDto, UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { ModuleCode } from '@prisma/client';
import { BulkUpdateApplicationsDto } from './dto/bulk-update-applications.dto';
import { DeleteResumeDto, ReplaceResumeDto } from './dto/file-operation.dto';
import { CreateApplicationSavedViewDto, CreateEmployeeReferralDto, UpdateApplicationSavedViewDto } from './dto/application-operations.dto';
import { ApplicationSlaService } from './application-sla.service';
import { RequestLocale } from '../common/decorators/request-locale.decorator';
import { SupportedLocale } from '../localization/localization.service';

@Controller('applications')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, ScopeGuard, PermissionGuard)
@TenantWide()
@RequireModule(ModuleCode.ATS)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService, private readonly applicationSla: ApplicationSlaService) {}

  @Get()
  @RequirePermissions('applications.read')
  findAll(
    @Req() request: RequestWithUser,
    @CurrentUser() user: JwtPayload,
    @Query() query: ListApplicationsDto,
  ) {
    return this.applicationsService.listForTenant(user, request.tenant!.id, query);
  }

  @Get('export')
  @RequirePermissions('applications.export')
  export(
    @Req() request: RequestWithUser,
    @CurrentUser() user: JwtPayload,
    @Query() query: ListApplicationsDto,
  ) {
    return this.applicationsService.exportForTenant(user, request.tenant!.id, query);
  }

  @Get('conversion-metrics')
  @RequirePermissions('applications.read')
  conversionMetrics(@Req() request: RequestWithUser, @CurrentUser() user: JwtPayload) {
    return this.applicationsService.conversionMetrics(user, request.tenant!.id);
  }

  @Patch('bulk/status')
  @RequirePermissions('applications.bulk_update')
  bulkUpdateStatus(
    @Req() request: RequestWithUser,
    @CurrentUser() user: JwtPayload,
    @Body() dto: BulkUpdateApplicationsDto,
  ) {
    return this.applicationsService.bulkUpdateStatus(user, request.tenant!.id, dto);
  }

  @Get('saved-views/list')
  @RequirePermissions('applications.read')
  savedViews(@Req() request: RequestWithUser, @CurrentUser() user: JwtPayload) {
    return this.applicationsService.listSavedViews(user, request.tenant!.id);
  }

  @Get('referrals') @RequirePermissions('applications.read')
  referrals(@Req() request: RequestWithUser, @CurrentUser() user: JwtPayload) { return this.applicationsService.listReferrals(user, request.tenant!.id); }

  @Post('referrals') @RequirePermissions('applications.create')
  createReferral(@Req() request: RequestWithUser, @CurrentUser() user: JwtPayload, @Body() dto: CreateEmployeeReferralDto) { return this.applicationsService.createReferral(user, request.tenant!.id, dto); }

  @Post('saved-views')
  @RequirePermissions('applications.read')
  createSavedView(@Req() request: RequestWithUser, @CurrentUser() user: JwtPayload, @Body() dto: CreateApplicationSavedViewDto) {
    return this.applicationsService.createSavedView(user, request.tenant!.id, dto);
  }

  @Put('saved-views/:id')
  @RequirePermissions('applications.read')
  updateSavedView(@Req() request: RequestWithUser, @CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateApplicationSavedViewDto) {
    return this.applicationsService.updateSavedView(id, user, request.tenant!.id, dto);
  }

  @Delete('saved-views/:id')
  @RequirePermissions('applications.read')
  deleteSavedView(@Req() request: RequestWithUser, @CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.applicationsService.deleteSavedView(id, user, request.tenant!.id);
  }

  @Get('rejection-reasons/list')
  @RequirePermissions('applications.read')
  rejectionReasons(@Req() request: RequestWithUser) {
    return this.applicationsService.listRejectionReasons(request.tenant!.id);
  }

  @Post('sla/process')
  @RequirePermissions('applications.bulk_update')
  processSla() {
    return this.applicationSla.processDue();
  }

  @Get(':id/files/resume')
  @RequirePermissions('applications.files.read')
  resumeFile(
    @Req() request: RequestWithUser,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.applicationsService.getResumeFile(id, user, request.tenant!.id);
  }

  @Get(':id/files/resume/versions')
  @RequirePermissions('applications.files.read')
  resumeVersions(
    @Req() request: RequestWithUser,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.applicationsService.listResumeVersions(id, user, request.tenant!.id);
  }

  @Post(':id/files/resume')
  @RequirePermissions('applications.update')
  @UseInterceptors(FileInterceptor('resume', {
    limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  }))
  replaceResume(
    @Req() request: RequestWithUser,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ReplaceResumeDto,
  ) {
    return this.applicationsService.replaceResume(
      id,
      user,
      request.tenant!.id,
      file,
      dto.reason,
    );
  }

  @Delete(':id/files/resume/:fileId')
  @RequirePermissions('applications.update')
  deleteResume(
    @Req() request: RequestWithUser,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Body() dto: DeleteResumeDto,
  ) {
    return this.applicationsService.deleteResumeVersion(
      id,
      fileId,
      user,
      request.tenant!.id,
      dto.reason,
    );
  }

  @Get('branch')
  @UseGuards(BranchAccessGuard)
  @BranchLocal()
  @RequirePermissions('applications.read')
  findAllForBranch(
    @Req() request: RequestWithUser,
    @CurrentBranch() branch: { id: string },
    @Query() query: ListApplicationsDto,
  ) {
    return this.applicationsService.listForBranch(request.tenant!.id, branch.id, query);
  }

  @Get(':id')
  @RequirePermissions('applications.read')
  findOne(@Req() request: RequestWithUser, @CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.applicationsService.findOneForTenant(id, user, request.tenant!.id);
  }

  @Get(':id/decision-evidence')
  @RequirePermissions('applications.export')
  decisionEvidence(@Req() request: RequestWithUser, @CurrentUser() user: JwtPayload, @Param('id') id: string) {
    request.auditAction = 'ATS_DECISION_EVIDENCE_EXPORTED';
    return this.applicationsService.decisionEvidence(id, user, request.tenant!.id);
  }

  @Get('branch/:id')
  @UseGuards(BranchAccessGuard)
  @BranchLocal()
  @RequirePermissions('applications.read')
  findOneForBranch(
    @Req() request: RequestWithUser,
    @CurrentBranch() branch: { id: string },
    @Param('id') id: string,
  ) {
    return this.applicationsService.findOneForBranch(id, request.tenant!.id, branch.id);
  }

  @Patch(':id/status')
  @RequirePermissions('applications.update')
  updateStatus(
    @Req() request: RequestWithUser,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    return this.applicationsService.updateStatus(id, user, request.tenant!.id, dto);
  }

  @Post(':id/transitions/undo')
  @RequirePermissions('applications.update')
  undoLatestTransition(
    @Req() request: RequestWithUser,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UndoApplicationTransitionDto,
    @RequestLocale() locale: SupportedLocale,
  ) {
    return this.applicationsService.undoLatestTransition(id, user, request.tenant!.id, dto.expectedUpdatedAt, locale);
  }

  @Post(':id/transitions/:requestId/approve')
  @RequirePermissions('applications.update')
  approveTransition(
    @Req() request: RequestWithUser,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Body() dto: DecideApplicationTransitionDto,
  ) {
    return this.applicationsService.decideTransition(id, requestId, user, request.tenant!.id, true, dto.note);
  }

  @Post(':id/transitions/:requestId/reject')
  @RequirePermissions('applications.update')
  rejectTransition(
    @Req() request: RequestWithUser,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Body() dto: DecideApplicationTransitionDto,
  ) {
    return this.applicationsService.decideTransition(id, requestId, user, request.tenant!.id, false, dto.note);
  }

  @Patch('branch/:id/status')
  @UseGuards(BranchAccessGuard)
  @BranchLocal()
  @RequirePermissions('applications.update')
  updateStatusForBranch(
    @Req() request: RequestWithUser,
    @CurrentUser() user: JwtPayload,
    @CurrentBranch() branch: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    return this.applicationsService.updateStatusForBranch(
      id,
      user,
      request.tenant!.id,
      branch.id,
      dto,
    );
  }
}
