import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
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
  UpsertTrainingCompliancePolicyDto,
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
