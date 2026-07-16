import { Body, Controller, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { UpdateWorkflowStepStatusDto } from './dto/update-workflow-step-status.dto';
import { UpdateWorkflowStepProgressDto } from './dto/update-workflow-step-progress.dto';
import { WorkflowsService } from './workflows.service';

@Controller('workflow-steps')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard)
export class WorkflowStepsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Patch(':id/status')
  @RequirePermissions('employees.update')
  updateStatus(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowStepStatusDto,
  ) {
    return this.workflowsService.updateWorkflowStepStatus(id, request.tenant!.id, request.user, dto);
  }

  @Patch(':id/progress')
  @RequirePermissions('employees.update')
  updateProgress(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowStepProgressDto,
  ) {
    return this.workflowsService.updateWorkflowStepProgress(id, request.tenant!.id, request.user, dto);
  }
}
