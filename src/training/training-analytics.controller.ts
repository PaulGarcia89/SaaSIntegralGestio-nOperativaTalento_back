import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ModuleCode } from '@prisma/client';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequestWithUser } from '../common/types/request-with-user.type';
import {
  TrainingAnalyticsQueryDto,
  CreateTrainingImprovementDto,
  ListTrainingImprovementsDto,
  UpdateTrainingImprovementDto,
  UpsertTrainingCompliancePolicyDto,
  CaptureTrainingIntelligenceDto,
} from './dto/training-analytics.dto';
import { TrainingAccessGuard } from './training-access.guard';
import { TrainingAnalyticsService } from './training-analytics.service';

@Controller('training/admin/analytics')
@UseGuards(
  JwtAuthGuard,
  TenantGuard,
  SubscriptionGuard,
  ModuleAccessGuard,
  TrainingAccessGuard,
  PermissionGuard,
)
@RequireModule(ModuleCode.TRAINING)
export class TrainingAnalyticsController {
  constructor(private readonly service: TrainingAnalyticsService) {}

  @Get('overview')
  @RequirePermissions('training.analytics.read')
  overview(@Req() request: RequestWithUser, @Query() query: TrainingAnalyticsQueryDto) {
    return this.service.overview(request.tenant!.id, query);
  }

  @Get('effectiveness')
  @RequirePermissions('training.analytics.read')
  effectiveness(@Req() request: RequestWithUser, @Query() query: TrainingAnalyticsQueryDto) {
    return this.service.effectiveness(request.tenant!.id, query);
  }

  @Get('intelligence')
  @RequirePermissions('training.analytics.read')
  intelligence(@Req() request: RequestWithUser) {
    return this.service.intelligence(request.tenant!.id);
  }

  @Post('intelligence')
  @RequirePermissions('training.compliance.manage')
  captureIntelligence(@Req() request: RequestWithUser, @Body() dto: CaptureTrainingIntelligenceDto) {
    request.auditAction = 'TRAINING_INTELLIGENCE_CAPTURED';
    return this.service.captureIntelligence(request.tenant!.id, request.user.sub, dto);
  }

  @Get('improvements')
  @RequirePermissions('training.analytics.read')
  improvements(@Req() request: RequestWithUser, @Query() query: ListTrainingImprovementsDto) {
    return this.service.listImprovements(request.tenant!.id, query);
  }

  @Post('improvements')
  @RequirePermissions('training.compliance.manage')
  createImprovement(@Req() request: RequestWithUser, @Body() dto: CreateTrainingImprovementDto) {
    request.auditAction = 'TRAINING_IMPROVEMENT_CREATED';
    return this.service.createImprovement(request.tenant!.id, request.user.sub, dto);
  }

  @Patch('improvements/:improvementId')
  @RequirePermissions('training.compliance.manage')
  updateImprovement(
    @Req() request: RequestWithUser,
    @Param('improvementId') improvementId: string,
    @Body() dto: UpdateTrainingImprovementDto,
  ) {
    request.auditAction = 'TRAINING_IMPROVEMENT_UPDATED';
    return this.service.updateImprovement(request.tenant!.id, improvementId, dto);
  }

  @Get('compliance-policies')
  @RequirePermissions('training.analytics.read')
  policies(@Req() request: RequestWithUser) {
    return this.service.listPolicies(request.tenant!.id);
  }

  @Post('compliance-policies')
  @RequirePermissions('training.compliance.manage')
  upsertPolicy(
    @Req() request: RequestWithUser,
    @Body() dto: UpsertTrainingCompliancePolicyDto,
  ) {
    request.auditAction = 'TRAINING_COMPLIANCE_POLICY_UPDATED';
    return this.service.upsertPolicy(request.tenant!.id, request.user.sub, dto);
  }
}
