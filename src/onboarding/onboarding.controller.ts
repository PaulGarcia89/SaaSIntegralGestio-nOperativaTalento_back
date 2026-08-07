import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ModuleCode } from '@prisma/client';
import type { Response } from 'express';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { ApplyOnboardingTemplateDto, ApproveOnboardingRetentionPolicyDto, ApproveOnboardingTemplateDto, BulkApplyOnboardingTemplateDto, CreateOnboardingLegalHoldDto, CreateOnboardingLibraryItemDto, CreateOnboardingTemplateDto, CreatePerformanceEvaluationDto, CreatePerformanceObjectiveDto, OnboardingTemplateTaskDto, ReorderOnboardingTasksDto, ReviewEmployeeDocumentDto, ReviseOnboardingTemplateDto, UpdateEmployeeDocumentLifecycleDto, UpdateOnboardingTaskDto, UpdateOnboardingTemplateStatusDto, UpsertOnboardingRetentionPolicyDto } from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';
import { OnboardingAutomationService } from './onboarding-automation.service';
import { CandidatePreboardingService } from './candidate-preboarding.service';
import { CandidateAuthGuard, CandidateRequest } from '../applications/candidate-auth.guard';
import { OnboardingAnalyticsService } from './onboarding-analytics.service';
import { OnboardingPerformanceService } from './onboarding-performance.service';

const allowedDocumentTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);

@Controller('onboarding')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, ScopeGuard, PermissionGuard)
@RequireModule(ModuleCode.ONBOARDING)
export class OnboardingController {
  constructor(private readonly service: OnboardingService, private readonly automation: OnboardingAutomationService, private readonly analytics: OnboardingAnalyticsService, private readonly performance: OnboardingPerformanceService) {}

  @Get('analytics')
  @RequirePermissions('applications.read')
  analyticsOverview(@Req() request: RequestWithUser, @Query('branchId') branchId?: string) {
    return this.analytics.overview(request.tenant!.id, request.user, branchId);
  }

  @Get('operations/overview')
  @RequirePermissions('applications.read')
  operationsOverview() { return this.automation.overview(); }

  @Post('operations/process-due')
  @RequirePermissions('applications.update')
  processDue() { return this.automation.processDueTasks(); }

  @Get('templates')
  @RequirePermissions('applications.read')
  templates(@Req() request: RequestWithUser) {
    return this.service.listTemplates(request.tenant!.id);
  }

  @Get('context')
  @RequirePermissions('applications.read')
  context(@Req() request: RequestWithUser, @Query('branchId') branchId?: string) {
    return this.service.getContext(request.tenant!.id, request.user, branchId);
  }

  @Post('templates')
  @RequirePermissions('applications.update')
  createTemplate(@Req() request: RequestWithUser, @Body() dto: CreateOnboardingTemplateDto) {
    request.auditAction = 'ONBOARDING_TEMPLATE_CREATED';
    return this.service.createTemplate(request.tenant!.id, request.user.sub, dto);
  }

  @Patch('templates/:id')
  @RequirePermissions('applications.update')
  updateTemplateStatus(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateOnboardingTemplateStatusDto) {
    request.auditAction = 'ONBOARDING_TEMPLATE_UPDATED';
    return this.service.updateTemplateStatus(request.tenant!.id, request.user.sub, id, dto);
  }

  @Post('templates/:id/revisions')
  @RequirePermissions('applications.update')
  reviseTemplate(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: ReviseOnboardingTemplateDto) {
    request.auditAction = 'ONBOARDING_TEMPLATE_REVISION_CREATED';
    return this.service.reviseTemplate(request.tenant!.id, request.user.sub, id, dto);
  }

  @Post('templates/:id/approve')
  @RequirePermissions('applications.update')
  approveTemplate(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: ApproveOnboardingTemplateDto) {
    request.auditAction = 'ONBOARDING_TEMPLATE_APPROVED';
    return this.service.approveTemplate(request.tenant!.id, request.user.sub, id, dto);
  }

  @Get('library')
  @RequirePermissions('applications.read')
  library(@Req() request: RequestWithUser) { return this.service.listLibrary(request.tenant!.id); }

  @Post('library')
  @RequirePermissions('applications.update')
  createLibraryItem(@Req() request: RequestWithUser, @Body() dto: CreateOnboardingLibraryItemDto) {
    request.auditAction = 'ONBOARDING_LIBRARY_ITEM_CREATED';
    return this.service.createLibraryItem(request.tenant!.id, request.user.sub, dto);
  }

  @Get('compliance/retention-policies')
  @RequirePermissions('applications.read')
  retentionPolicies(@Req() request: RequestWithUser) { return this.service.listRetentionPolicies(request.tenant!.id); }

  @Post('compliance/retention-policies')
  @RequirePermissions('applications.update')
  saveRetentionPolicy(@Req() request: RequestWithUser, @Body() dto: UpsertOnboardingRetentionPolicyDto) {
    request.auditAction = 'ONBOARDING_RETENTION_POLICY_SAVED';
    return this.service.upsertRetentionPolicy(request.tenant!.id, request.user.sub, dto);
  }

  @Post('compliance/retention-policies/:id/approve')
  @RequirePermissions('applications.update')
  approveRetentionPolicy(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: ApproveOnboardingRetentionPolicyDto) {
    request.auditAction = 'ONBOARDING_RETENTION_POLICY_APPROVED';
    return this.service.approveRetentionPolicy(request.tenant!.id, request.user.sub, id, dto);
  }

  @Get('compliance/signature-evidence')
  @RequirePermissions('applications.read')
  signatureEvidence(@Query('countryCode') countryCode?: string) { return this.service.signatureEvidenceProfile(countryCode); }

  @Get('flows')
  @RequirePermissions('applications.read')
  flows(
    @Req() request: RequestWithUser,
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listFlows(request.tenant!.id, request.user, {
      branchId, search, status,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get('flows/:id')
  @RequirePermissions('applications.read')
  flow(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.getFlow(request.tenant!.id, id, request.user);
  }

  @Get('flows/:id/performance')
  @RequirePermissions('applications.read')
  performanceOverview(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.performance.overview(request.tenant!.id, request.user, id);
  }

  @Post('flows/:id/performance/objectives')
  @RequirePermissions('applications.update')
  createPerformanceObjective(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: CreatePerformanceObjectiveDto) {
    request.auditAction = 'ONBOARDING_PERFORMANCE_OBJECTIVE_CREATED';
    return this.performance.createObjective(request.tenant!.id, request.user, id, dto);
  }

  @Post('flows/:id/performance/evaluations')
  @RequirePermissions('applications.update')
  recordPerformanceEvaluation(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: CreatePerformanceEvaluationDto) {
    request.auditAction = 'ONBOARDING_PERFORMANCE_EVALUATION_RECORDED';
    return this.performance.recordEvaluation(request.tenant!.id, request.user, id, dto);
  }

  @Post('flows/:id/apply-template')
  @RequirePermissions('applications.update')
  applyTemplate(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: ApplyOnboardingTemplateDto) {
    request.auditAction = 'ONBOARDING_TEMPLATE_APPLIED';
    return this.service.applyTemplate(request.tenant!.id, id, request.user, dto);
  }

  @Post('flows/bulk-apply-template')
  @RequirePermissions('applications.update')
  bulkApplyTemplate(@Req() request: RequestWithUser, @Body() dto: BulkApplyOnboardingTemplateDto) {
    request.auditAction = 'ONBOARDING_TEMPLATE_BULK_APPLIED';
    return this.service.applyTemplateBulk(request.tenant!.id, request.user, dto);
  }

  @Patch('tasks/:id')
  @RequirePermissions('applications.update')
  updateTask(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateOnboardingTaskDto) {
    request.auditAction = 'ONBOARDING_TASK_UPDATED';
    return this.service.updateTask(request.tenant!.id, id, request.user, dto);
  }

  @Post('flows/:id/tasks')
  @RequirePermissions('applications.update')
  createTask(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: OnboardingTemplateTaskDto) {
    request.auditAction = 'ONBOARDING_TASK_CREATED';
    return this.service.createTask(request.tenant!.id, id, request.user, dto);
  }

  @Post('flows/:id/tasks/reorder')
  @RequirePermissions('applications.update')
  reorderTasks(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: ReorderOnboardingTasksDto) {
    request.auditAction = 'ONBOARDING_TASKS_REORDERED';
    return this.service.reorderTasks(request.tenant!.id, id, request.user, dto);
  }

  @Delete('tasks/:id')
  @RequirePermissions('applications.update')
  deleteTask(@Req() request: RequestWithUser, @Param('id') id: string) {
    request.auditAction = 'ONBOARDING_TASK_DELETED';
    return this.service.deleteTask(request.tenant!.id, id, request.user);
  }

  @Post('flows/:id/documents')
  @RequirePermissions('applications.update')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    fileFilter: (_request, file, callback) => callback(null, allowedDocumentTypes.has(file.mimetype)),
  }))
  upload(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('taskId') taskId?: string,
    @Body('category') category = 'OTHER',
  ) {
    if (!file) throw new BadRequestException('Only PDF, JPEG and PNG documents up to 15 MB are accepted');
    request.auditAction = 'EMPLOYEE_DOCUMENT_UPLOADED';
    return this.service.uploadDocument(request.tenant!.id, request.user, id, taskId, category, file);
  }

  @Get('documents/:id/download')
  @RequirePermissions('applications.read')
  async download(@Req() request: RequestWithUser, @Param('id') id: string, @Res() response: Response) {
    const result = await this.service.downloadDocument(request.tenant!.id, id, request.user);
    response.setHeader('Content-Type', result.document.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.document.originalName)}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(result.buffer);
  }

  @Patch('documents/:id/review')
  @RequirePermissions('applications.update')
  review(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: ReviewEmployeeDocumentDto) {
    request.auditAction = 'EMPLOYEE_DOCUMENT_REVIEWED';
    return this.service.reviewDocument(request.tenant!.id, request.user, id, dto);
  }

  @Post('documents/:id/replace')
  @RequirePermissions('applications.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024, files: 1 }, fileFilter: (_request, file, callback) => callback(null, allowedDocumentTypes.has(file.mimetype)) }))
  replaceDocument(@Req() request: RequestWithUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Only PDF, JPEG and PNG documents up to 15 MB are accepted');
    request.auditAction = 'EMPLOYEE_DOCUMENT_REPLACED';
    return this.service.replaceDocument(request.tenant!.id, request.user, id, file);
  }

  @Patch('documents/:id/lifecycle')
  @RequirePermissions('applications.update')
  updateDocumentLifecycle(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateEmployeeDocumentLifecycleDto) {
    request.auditAction = 'EMPLOYEE_DOCUMENT_LIFECYCLE_UPDATED';
    return this.service.updateDocumentLifecycle(request.tenant!.id, request.user, id, dto);
  }

  @Delete('documents/:id')
  @RequirePermissions('applications.update')
  deleteDocument(@Req() request: RequestWithUser, @Param('id') id: string) {
    request.auditAction = 'EMPLOYEE_DOCUMENT_DELETED';
    return this.service.deleteDocument(request.tenant!.id, request.user, id);
  }

  @Post('flows/:id/complete')
  @RequirePermissions('applications.update')
  completeFlow(@Req() request: RequestWithUser, @Param('id') id: string) {
    request.auditAction = 'ONBOARDING_FLOW_COMPLETED';
    return this.service.completeFlow(request.tenant!.id, id, request.user);
  }

  @Post('flows/:id/legal-holds')
  @RequirePermissions('applications.update')
  placeLegalHold(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: CreateOnboardingLegalHoldDto) {
    request.auditAction = 'ONBOARDING_LEGAL_HOLD_PLACED';
    return this.service.placeLegalHold(request.tenant!.id, id, request.user, dto);
  }

  @Post('legal-holds/:id/release')
  @RequirePermissions('applications.update')
  releaseLegalHold(@Req() request: RequestWithUser, @Param('id') id: string) {
    request.auditAction = 'ONBOARDING_LEGAL_HOLD_RELEASED';
    return this.service.releaseLegalHold(request.tenant!.id, id, request.user);
  }

  @Get('flows/:id/export')
  @RequirePermissions('applications.read')
  exportDossier(@Req() request: RequestWithUser, @Param('id') id: string) {
    request.auditAction = 'ONBOARDING_DOSSIER_EXPORTED';
    return this.service.exportFlowDossier(request.tenant!.id, id, request.user);
  }
}

@Controller('candidate/preboarding')
@UseGuards(CandidateAuthGuard)
export class CandidatePreboardingController {
  constructor(private readonly service: CandidatePreboardingService) {}
  @Get() overview(@Req() request: CandidateRequest) { return this.service.overview(request.candidate.sub); }
  @Patch('tasks/:id/complete') complete(@Req() request: CandidateRequest, @Param('id') id: string) { return this.service.completeTask(request.candidate.sub, id); }
  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024, files: 1 } }))
  upload(@Req() request: CandidateRequest, @UploadedFile() file: Express.Multer.File, @Body('taskId') taskId?: string, @Body('category') category?: string) { return this.service.uploadDocument(request.candidate.sub, taskId, category ?? 'OTHER', file); }
}
