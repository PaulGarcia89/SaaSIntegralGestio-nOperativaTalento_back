import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ModuleCode } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { UpsertFeatureFlagDto } from './dto/upsert-feature-flag.dto';
import { FeatureFlagsService } from './feature-flags.service';

@Controller('feature-flags')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard)
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  @RequirePermissions('modules.read')
  findAll(@CurrentUser() user: JwtPayload) {
    return this.featureFlagsService.findAll(user);
  }

  @Put(':moduleCode')
  @RequirePermissions('modules.update')
  upsert(
    @CurrentUser() user: JwtPayload,
    @Param('moduleCode') moduleCode: ModuleCode,
    @Body() dto: UpsertFeatureFlagDto,
  ) {
    return this.featureFlagsService.upsert(user, {
      ...dto,
      moduleCode,
    });
  }
}
