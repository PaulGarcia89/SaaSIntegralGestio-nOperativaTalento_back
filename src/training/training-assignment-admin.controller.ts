import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
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
  CreateTrainingAssignmentsDto,
  ListTrainingAdminAssignmentsDto,
} from './dto/training-assignment-admin.dto';
import { TrainingAccessGuard } from './training-access.guard';
import { TrainingAssignmentAdminService } from './training-assignment-admin.service';

@Controller('training/admin/assignments')
@UseGuards(
  JwtAuthGuard,
  TenantGuard,
  SubscriptionGuard,
  ModuleAccessGuard,
  TrainingAccessGuard,
  PermissionGuard,
)
@RequireModule(ModuleCode.TRAINING)
export class TrainingAssignmentAdminController {
  constructor(private readonly service: TrainingAssignmentAdminService) {}

  @Get()
  @RequirePermissions('training.progress.read')
  list(@Req() request: RequestWithUser, @Query() query: ListTrainingAdminAssignmentsDto) {
    return this.service.list(request.tenant!.id, query);
  }

  @Post()
  @RequirePermissions('training.assign')
  create(@Req() request: RequestWithUser, @Body() dto: CreateTrainingAssignmentsDto) {
    request.auditAction = 'TRAINING_ASSIGNED';
    return this.service.create(request.tenant!.id, request.user, dto);
  }

  @Delete(':assignmentId')
  @RequirePermissions('training.assign')
  remove(@Req() request: RequestWithUser, @Param('assignmentId') assignmentId: string) {
    request.auditAction = 'TRAINING_ASSIGNMENT_REMOVED';
    return this.service.remove(request.tenant!.id, assignmentId);
  }
}
