import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ModuleCode } from '@prisma/client';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { CreateSignaturePackageDto, CreateSignatureTemplateDto, SubmitSignatureConsentDto } from './dto/signatures.dto';
import { SignaturesService } from './signatures.service';
import { DocuSealService } from './docuseal.service';

@Controller('signatures')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, ScopeGuard, PermissionGuard)
@RequireModule(ModuleCode.ONBOARDING)
export class SignaturesController {
  constructor(private readonly service: SignaturesService, private readonly docuSeal: DocuSealService) {}

  @Get('providers') @RequirePermissions('applications.read')
  providers() { return this.service.providersOverview(); }

  @Get('templates') @RequirePermissions('applications.read')
  templates(@Req() request: RequestWithUser) { return this.service.listTemplates(request.tenant!.id); }

  @Post('templates') @RequirePermissions('applications.update')
  createTemplate(@Req() request: RequestWithUser, @Body() dto: CreateSignatureTemplateDto) {
    request.auditAction = 'SIGNATURE_TEMPLATE_CREATED';
    return this.service.createTemplate(request.tenant!.id, request.user.sub, dto);
  }

  @Get('packages') @RequirePermissions('applications.read')
  packages(@Req() request: RequestWithUser) { return this.service.listPackages(request.tenant!.id); }

  @Post('packages') @RequirePermissions('applications.update')
  createPackage(@Req() request: RequestWithUser, @Body() dto: CreateSignaturePackageDto) {
    request.auditAction = 'SIGNATURE_PACKAGE_CREATED';
    return this.service.createPackage(request.tenant!.id, request.user.sub, request.requestId, dto);
  }

  @Post('packages/:id/send') @RequirePermissions('applications.update')
  send(@Req() request: RequestWithUser, @Param('id') id: string) {
    request.auditAction = 'SIGNATURE_PACKAGE_SENT';
    return this.service.sendPackage(request.tenant!.id, request.user.sub, id, request.requestId);
  }

  @Post('packages/:id/remind') @RequirePermissions('applications.update')
  remind(@Req() request: RequestWithUser, @Param('id') id: string) {
    request.auditAction = 'SIGNATURE_REMINDER_SENT';
    return this.service.remind(request.tenant!.id, request.user.sub, id, request.requestId);
  }

  @Get('docuseal/templates') @RequirePermissions('employees.read')
  docuSealTemplates() { return { configured: this.docuSeal.isConfigured(), templates: this.docuSeal.templates() }; }

  @Post('docuseal/submissions') @RequirePermissions('employees.update')
  docuSealSubmission(@Req() request: RequestWithUser, @Body() body: { employeeId?: string; templateKey?: string }) {
    if (!body.employeeId || !body.templateKey) throw new BadRequestException('employeeId y templateKey son obligatorios');
    return this.docuSeal.createEmployeeSubmission(request.tenant!.id, request.user.sub, body.employeeId, body.templateKey);
  }

  @Post('docuseal/hiring-bundle') @RequirePermissions('employees.update')
  docuSealHiringBundle(@Req() request: RequestWithUser, @Body() body: { employeeId?: string }) {
    if (!body.employeeId) throw new BadRequestException('employeeId es obligatorio');
    return this.docuSeal.createHiringBundle(request.tenant!.id, request.user.sub, body.employeeId);
  }

  @Post('docuseal/hiring-bundle/application/:applicationId') @RequirePermissions('employees.update')
  docuSealHiringBundleForApplication(@Req() request: RequestWithUser, @Param('applicationId') applicationId: string) {
    return this.docuSeal.createHiringBundleForApplication(request.tenant!.id, request.user.sub, applicationId);
  }

  @Get('docuseal/hiring-bundle/application/:applicationId/status') @RequirePermissions('applications.read')
  docuSealHiringBundleStatus(@Req() request: RequestWithUser, @Param('applicationId') applicationId: string) {
    return this.docuSeal.hiringBundleStatusForApplication(request.tenant!.id, applicationId);
  }
}

@Controller('public/signatures')
export class PublicSignaturesController {
  constructor(private readonly service: SignaturesService) {}

  @Get(':token')
  context(@Param('token') token: string) { return this.service.getSigningContext(token); }

  @Post(':token/consent')
  sign(@Req() request: Request, @Param('token') token: string, @Body() dto: SubmitSignatureConsentDto) {
    const forwarded = request.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : request.ip;
    return this.service.sign(token, dto, { ip, userAgent: request.headers['user-agent'], requestId: request.headers['x-request-id'] as string | undefined });
  }
}

@Controller('webhooks/docuseal')
export class DocuSealWebhookController {
  constructor(private readonly docuSeal: DocuSealService) {}

  @Post()
  webhook(@Req() request: Request, @Body() payload: { event_type?: string; data?: Record<string, unknown> }, @Headers('x-docuseal-signature') signature?: string, @Headers('x-docuseal-webhook-secret') headerSecret?: string, @Query('secret') querySecret?: string) {
    this.docuSeal.assertWebhookRequest((request as Request & { rawBody?: Buffer }).rawBody, signature, headerSecret ?? querySecret);
    return this.docuSeal.handleWebhook(payload as never);
  }
}
