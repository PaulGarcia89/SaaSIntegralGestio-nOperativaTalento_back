import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { ListWorkflowMasterDto } from './dto/list-workflow-master.dto';
import { WorkflowMasterService } from './workflow-master.service';

@Controller('workflow-master')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard)
export class WorkflowMasterController {
  constructor(private readonly workflowMasterService: WorkflowMasterService) {}

  @Get()
  @RequirePermissions('workflow_master.read')
  findAll(@Req() request: RequestWithUser, @Query() query: ListWorkflowMasterDto) {
    return this.workflowMasterService.findAll(request.user, query);
  }

  @Get(':employeeId')
  @RequirePermissions('workflow_master.read')
  findCurrentByEmployee(@Req() request: RequestWithUser, @Param('employeeId') employeeId: string) {
    return this.workflowMasterService.findCurrentByEmployee(request.user, employeeId);
  }
}
