import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
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
import { ApplyOnboardingTemplateDto, CreateOnboardingTemplateDto, ReviewEmployeeDocumentDto, UpdateOnboardingTaskDto } from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';

const allowedDocumentTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);

@Controller('onboarding')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, ScopeGuard, PermissionGuard)
@RequireModule(ModuleCode.ONBOARDING)
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}

  @Get('templates')
  @RequirePermissions('applications.read')
  templates(@Req() request: RequestWithUser) {
    return this.service.listTemplates(request.tenant!.id);
  }

  @Post('templates')
  @RequirePermissions('applications.update')
  createTemplate(@Req() request: RequestWithUser, @Body() dto: CreateOnboardingTemplateDto) {
    request.auditAction = 'ONBOARDING_TEMPLATE_CREATED';
    return this.service.createTemplate(request.tenant!.id, request.user.sub, dto);
  }

  @Get('flows')
  @RequirePermissions('applications.read')
  flows(@Req() request: RequestWithUser, @Query('branchId') branchId?: string) {
    return this.service.listFlows(request.tenant!.id, branchId);
  }

  @Get('flows/:id')
  @RequirePermissions('applications.read')
  flow(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.getFlow(request.tenant!.id, id);
  }

  @Post('flows/:id/apply-template')
  @RequirePermissions('applications.update')
  applyTemplate(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: ApplyOnboardingTemplateDto) {
    request.auditAction = 'ONBOARDING_TEMPLATE_APPLIED';
    return this.service.applyTemplate(request.tenant!.id, id, dto);
  }

  @Patch('tasks/:id')
  @RequirePermissions('applications.update')
  updateTask(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateOnboardingTaskDto) {
    request.auditAction = 'ONBOARDING_TASK_UPDATED';
    return this.service.updateTask(request.tenant!.id, id, dto);
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
    return this.service.uploadDocument(request.tenant!.id, request.user.sub, id, taskId, category, file);
  }

  @Get('documents/:id/download')
  @RequirePermissions('applications.read')
  async download(@Req() request: RequestWithUser, @Param('id') id: string, @Res() response: Response) {
    const result = await this.service.downloadDocument(request.tenant!.id, id);
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
    return this.service.reviewDocument(request.tenant!.id, request.user.sub, id, dto);
  }
}
