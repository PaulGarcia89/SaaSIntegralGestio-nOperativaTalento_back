import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ModuleCode } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { UpsertFeatureFlagDto } from './dto/upsert-feature-flag.dto';
import { FeatureFlagsService } from './feature-flags.service';

@Controller('feature-flags')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard)
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  @RequirePermissions('modules.read')
  findAll(@CurrentUser() user: JwtPayload, @Req() req: RequestWithUser) {
    return this.featureFlagsService.findAll(user, req.tenant!.id);
  }

  @Put(':moduleCode')
  @RequirePermissions('modules.update')
  upsert(
    @CurrentUser() user: JwtPayload,
    @Req() req: RequestWithUser,
    @Param('moduleCode') moduleCode: ModuleCode,
    @Body() dto: UpsertFeatureFlagDto,
  ) {
    return this.featureFlagsService.upsert(user, {
      tenantId: req.tenant!.id,
      ...dto,
      moduleCode,
    });
  }
}
