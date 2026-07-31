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
import { CreateTrainingLaunchDto, ListTrainingLaunchesDto, UpdateTrainingLaunchStatusDto } from './dto/training-launch.dto';
import { TrainingAccessGuard } from './training-access.guard';
import { TrainingLaunchService } from './training-launch.service';

@Controller('training/admin/launches')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, TrainingAccessGuard, PermissionGuard)
@RequireModule(ModuleCode.TRAINING)
export class TrainingLaunchController {
  constructor(private readonly service: TrainingLaunchService) {}

  @Get()
  @RequirePermissions('training.progress.read')
  list(@Req() request: RequestWithUser, @Query() query: ListTrainingLaunchesDto) {
    return this.service.list(request.tenant!.id, query);
  }

  @Post()
  @RequirePermissions('training.assign')
  create(@Req() request: RequestWithUser, @Body() dto: CreateTrainingLaunchDto) {
    request.auditAction = 'TRAINING_LAUNCH_CREATED';
    return this.service.create(request.tenant!.id, request.user, dto);
  }

  @Post(':launchId/deploy')
  @RequirePermissions('training.assign')
  deploy(@Req() request: RequestWithUser, @Param('launchId') launchId: string) {
    request.auditAction = 'TRAINING_LAUNCH_BATCH_DEPLOYED';
    return this.service.deploy(request.tenant!.id, launchId);
  }

  @Patch(':launchId/status')
  @RequirePermissions('training.assign')
  updateStatus(@Req() request: RequestWithUser, @Param('launchId') launchId: string, @Body() dto: UpdateTrainingLaunchStatusDto) {
    request.auditAction = 'TRAINING_LAUNCH_STATUS_CHANGED';
    return this.service.updateStatus(request.tenant!.id, launchId, dto);
  }
}
