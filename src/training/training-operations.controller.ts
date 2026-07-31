import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ModuleCode } from '@prisma/client';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { ExecuteTrainingOperationDto } from './dto/training-operations.dto';
import { TrainingAccessGuard } from './training-access.guard';
import { TrainingOperationsService } from './training-operations.service';

@Controller('training/admin/operations')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, TrainingAccessGuard, PermissionGuard)
@RequireModule(ModuleCode.TRAINING)
export class TrainingOperationsController {
  constructor(private readonly service: TrainingOperationsService) {}

  @Get()
  @RequirePermissions('training.integrations.manage')
  overview(@Req() request: RequestWithUser) {
    return this.service.overview(request.tenant!.id);
  }

  @Post('execute')
  @RequirePermissions('training.integrations.manage')
  execute(@Req() request: RequestWithUser, @Body() dto: ExecuteTrainingOperationDto) {
    request.auditAction = `TRAINING_OPERATION_${dto.kind}`;
    return this.service.execute(request.tenant!.id, request.user.sub, dto.kind);
  }
}
