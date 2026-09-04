import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { ModuleCode } from '@prisma/client';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { CreateScormPackageDto, CreateTrainingSessionDto, CreateTrainingWebhookDto, CreateXapiStatementDto, RotateTrainingWebhookSecretDto } from './dto/training-integrations.dto';
import { TrainingAccessGuard } from './training-access.guard';
import { TrainingIntegrationsService } from './training-integrations.service';
import { TrainingScormStorageService } from './training-scorm-storage.service';
import { Public } from '../common/decorators/public.decorator';
@Controller('training/integrations')
@UseGuards(JwtAuthGuard,TenantGuard,SubscriptionGuard,ModuleAccessGuard,TrainingAccessGuard,PermissionGuard)
@RequireModule(ModuleCode.TRAINING)
export class TrainingIntegrationsController {
  constructor(private readonly service: TrainingIntegrationsService, private readonly scormStorage: TrainingScormStorageService) {}
  @Get() @RequirePermissions('training.integrations.manage') overview(@Req() req: RequestWithUser) { return this.service.overview(req.tenant!.id); }
  @Post('scorm-packages') @RequirePermissions('training.integrations.manage') package(@Req() req: RequestWithUser,@Body() dto: CreateScormPackageDto) { req.auditAction='TRAINING_SCORM_REGISTERED'; return this.service.createPackage(req.tenant!.id,req.user.sub,dto); }
  @Post('scorm-packages/upload')
  @RequirePermissions('training.integrations.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, callback) => callback(null, file.mimetype === 'application/zip' || file.originalname.toLowerCase().endsWith('.zip')) }))
  uploadPackage(@Req() req: RequestWithUser, @UploadedFile() file: Express.Multer.File, @Body('courseId') courseId: string, @Body('title') title: string) {
    req.auditAction = 'TRAINING_SCORM_UPLOADED';
    return this.scormStorage.store(req.tenant!.id, req.user.sub, courseId, title, file);
  }
  @Get('scorm-packages/:id/files/:filePath(*)')
  @RequirePermissions('training.read')
  async scormAsset(@Req() req: RequestWithUser, @Param('id') id: string, @Param('filePath') filePath: string, @Res() response: Response) {
    const asset = await this.scormStorage.readAsset(req.tenant!.id, id, filePath);
    const contentTypes: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.pdf': 'application/pdf' };
    response.setHeader('Content-Type', contentTypes[path.extname(asset.filePath).toLowerCase()] ?? 'application/octet-stream');
    response.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; media-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(asset.buffer);
  }
  @Get('scorm-packages/:id/launch-url') @RequirePermissions('training.read')
  launchUrl(@Req() req: RequestWithUser, @Param('id') id: string) { return this.scormStorage.createLaunchUrl(req.tenant!.id, id); }
  @Post('webhooks') @RequirePermissions('training.integrations.manage') webhook(@Req() req: RequestWithUser,@Body() dto: CreateTrainingWebhookDto) { req.auditAction='TRAINING_WEBHOOK_CREATED'; return this.service.createWebhook(req.tenant!.id,req.user.sub,dto); }
  @Post('xapi/statements') @RequirePermissions('training.update') xapi(@Req() req: RequestWithUser,@Body() dto: CreateXapiStatementDto) { return this.service.recordXapi(req.tenant!.id,req.user.sub,dto); }
  @Post('sessions') @RequirePermissions('training.integrations.manage') session(@Req() req: RequestWithUser,@Body() dto: CreateTrainingSessionDto) { return this.service.createSession(req.tenant!.id,dto); }
  @Patch('recommendations/:id/:status') @RequirePermissions('training.integrations.manage') recommendation(@Req() req: RequestWithUser,@Param('id') id:string,@Param('status') status:'ACCEPTED'|'DISMISSED') { return this.service.decideRecommendation(req.tenant!.id,req.user.sub,id,status); }
  @Post('webhooks/test') @RequirePermissions('training.integrations.manage') testWebhook(@Req() req: RequestWithUser) { req.auditAction='TRAINING_WEBHOOK_TESTED'; return this.service.testWebhook(req.tenant!.id); }
  @Post('webhook-deliveries/:id/retry') @RequirePermissions('training.integrations.manage') retryWebhook(@Req() req: RequestWithUser,@Param('id') id:string) { req.auditAction='TRAINING_WEBHOOK_RETRIED'; return this.service.retryWebhook(req.tenant!.id,id); }
  @Patch('webhooks/:id/secret') @RequirePermissions('training.integrations.manage') rotateWebhookSecret(@Req() req: RequestWithUser,@Param('id') id:string,@Body() dto:RotateTrainingWebhookSecretDto) { req.auditAction='TRAINING_WEBHOOK_SECRET_ROTATED'; return this.service.rotateWebhookSecret(req.tenant!.id,id,dto.secret); }
}

@Controller('training/scorm')
@Public()
export class PublicTrainingScormController {
  constructor(private readonly scormStorage: TrainingScormStorageService) {}
  @Get(':id/launch')
  async launch(@Param('id') id: string, @Query('tenant') tenantId: string, @Query('expires') expires: string, @Query('token') token: string, @Res() response: Response) {
    const access = await this.scormStorage.validateLaunch(id, tenantId, Number(expires), token);
    response.cookie(`talentos_scorm_${id}`, access.cookie, { httpOnly: true, sameSite: 'lax', secure: process.env.AUTH_COOKIE_SECURE === 'true', maxAge: 4 * 60 * 60_000, path: `/api/training/scorm/${id}` });
    response.redirect(`/api/training/scorm/${id}/files/${access.launchPath}`);
  }
  @Get(':id/files/:filePath(*)')
  async asset(@Req() request: Request, @Param('id') id: string, @Param('filePath') filePath: string, @Res() response: Response) {
    const cookies = Object.fromEntries((request.headers.cookie ?? '').split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter((part) => part.length === 2));
    const cookie = cookies[`talentos_scorm_${id}`];
    if (!cookie) throw new BadRequestException('SCORM session required');
    const item = await this.scormStorage.findTenantForPackage(id);
    this.scormStorage.validateAssetCookie(item.tenantId, id, cookie);
    const asset = await this.scormStorage.readAsset(item.tenantId, id, filePath);
    response.setHeader('Content-Type', this.contentType(asset.filePath));
    response.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; media-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(asset.buffer);
  }
  private contentType(file: string) {
    const types: Record<string,string> = { '.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.xml':'application/xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.mp4':'video/mp4','.pdf':'application/pdf' };
    return types[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  }
}
