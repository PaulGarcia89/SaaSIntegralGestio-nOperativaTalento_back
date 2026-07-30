import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ModuleCode } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GlobalOnly } from '../common/decorators/global-only.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { UpsertFeatureFlagDto } from './dto/upsert-feature-flag.dto';
import { FeatureFlagsService } from './feature-flags.service';

@Controller('feature-flags')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ScopeGuard, PermissionGuard)
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  @RequirePermissions('modules.read')
  findAll(@CurrentUser() user: JwtPayload, @Req() req: RequestWithUser) {
    return this.featureFlagsService.findAll(user, req.tenant!.id);
  }

  @Get('global')
  @GlobalOnly()
  @RequirePermissions('modules.read')
  findAllGlobal(@CurrentUser() user: JwtPayload) {
    return this.featureFlagsService.findAllGlobal(user);
  }

  @Put('global/:tenantId/:moduleCode')
  @GlobalOnly()
  @RequirePermissions('modules.update')
  upsertGlobal(
    @CurrentUser() user: JwtPayload,
    @Param('tenantId') tenantId: string,
    @Param('moduleCode') moduleCode: ModuleCode,
    @Body() dto: UpsertFeatureFlagDto,
  ) {
    return this.featureFlagsService.upsert(user, {
      ...dto,
      tenantId,
      moduleCode,
    });
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
      ...dto,
      tenantId: req.tenant!.id,
      moduleCode,
    });
  }
}
