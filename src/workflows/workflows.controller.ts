import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { CreateHiringWorkflowDto } from './dto/create-hiring-workflow.dto';
import { CreateBranchTransferWorkflowDto } from './dto/create-branch-transfer-workflow.dto';
import { CreateOffboardingWorkflowDto } from './dto/create-offboarding-workflow.dto';
import { AddWorkflowEventDto } from './dto/add-workflow-event.dto';
import { ListWorkflowsDto } from './dto/list-workflows.dto';
import { UpdateWorkflowStageDto } from './dto/update-workflow-stage.dto';
import { WorkflowActionDto } from './dto/workflow-action.dto';
import { WorkflowsService } from './workflows.service';
import { WorkflowStageKey } from '@prisma/client';

@Controller('workflows')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard)
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post('hiring')
  @RequirePermissions('applications.update')
  createHiring(@Req() request: RequestWithUser, @Body() dto: CreateHiringWorkflowDto) {
    return this.workflowsService.createHiringWorkflow(request.tenant!.id, request.user, dto);
  }

  @Post('branch-transfer')
  @RequirePermissions('employees.update')
  createBranchTransfer(@Req() request: RequestWithUser, @Body() dto: CreateBranchTransferWorkflowDto) {
    return this.workflowsService.createBranchTransferWorkflow(request.tenant!.id, request.user, dto);
  }

  @Post('offboarding')
  @RequirePermissions('employees.update')
  createOffboarding(@Req() request: RequestWithUser, @Body() dto: CreateOffboardingWorkflowDto) {
    return this.workflowsService.createOffboardingWorkflow(request.tenant!.id, request.user, dto);
  }

  @Get()
  @RequirePermissions('employees.read')
  findAll(@Req() request: RequestWithUser, @Query() query: ListWorkflowsDto) {
    return this.workflowsService.findAll(request.tenant!.id, request.user, query);
  }

  @Get(':employeeId/current')
  @RequirePermissions('employees.read')
  findCurrentByEmployee(@Req() request: RequestWithUser, @Param('employeeId') employeeId: string) {
    return this.workflowsService.findCurrentByEmployee(employeeId, request.tenant!.id, request.user);
  }

  @Get(':id')
  @RequirePermissions('employees.read')
  findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.workflowsService.findOne(id, request.tenant!.id, request.user);
  }

  @Get(':id/master-card')
  @RequirePermissions('employees.read')
  getMasterCard(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.workflowsService.getMasterCard(id, request.tenant!.id, request.user);
  }

  @Get(':id/timeline')
  @RequirePermissions('employees.read')
  getTimeline(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.workflowsService.getTimeline(id, request.tenant!.id, request.user);
  }

  @Get(':id/blockers')
  @RequirePermissions('employees.read')
  getBlockers(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.workflowsService.getBlockers(id, request.tenant!.id, request.user);
  }

  @Post(':id/events')
  @RequirePermissions('employees.update')
  addEvent(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: AddWorkflowEventDto) {
    return this.workflowsService.addWorkflowEvent(id, request.tenant!.id, request.user, dto);
  }

  @Patch(':id/steps/:stepKey/start')
  @RequirePermissions('employees.update')
  startStep(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('stepKey') stepKey: WorkflowStageKey,
    @Body() dto: UpdateWorkflowStageDto,
  ) {
    return this.workflowsService.startStage(id, stepKey, request.tenant!.id, request.user, {
      ...dto,
      stepKey,
    });
  }

  @Patch(':id/steps/:stepKey/complete')
  @RequirePermissions('employees.update')
  completeStep(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('stepKey') stepKey: WorkflowStageKey,
    @Body() dto: UpdateWorkflowStageDto,
  ) {
    return this.workflowsService.completeStage(id, stepKey, request.tenant!.id, request.user, {
      ...dto,
      stepKey,
    });
  }

  @Post(':id/complete-onboarding')
  @RequirePermissions('employees.update')
  completeOnboarding(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: WorkflowActionDto) {
    return this.workflowsService.completeOnboarding(id, request.tenant!.id, request.user, dto);
  }

  @Post(':id/complete-signature')
  @RequirePermissions('employees.update')
  completeSignature(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: WorkflowActionDto) {
    return this.workflowsService.completeSignature(id, request.tenant!.id, request.user, dto);
  }

  @Post(':id/assign-asset')
  @RequirePermissions('employees.update')
  assignAsset(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: WorkflowActionDto) {
    return this.workflowsService.assignAsset(id, request.tenant!.id, request.user, dto);
  }

  @Post(':id/activate-training')
  @RequirePermissions('training.update')
  activateTraining(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: WorkflowActionDto) {
    return this.workflowsService.activateTraining(id, request.tenant!.id, request.user, dto);
  }

  @Post(':id/provision-access')
  @RequirePermissions('employees.update')
  provisionAccess(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: WorkflowActionDto) {
    return this.workflowsService.provisionAccess(id, request.tenant!.id, request.user, dto);
  }

  @Post(':id/recover-asset')
  @RequirePermissions('employees.update')
  recoverAsset(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: WorkflowActionDto) {
    return this.workflowsService.recoverAsset(id, request.tenant!.id, request.user, dto);
  }

  @Post(':id/close-access')
  @RequirePermissions('employees.update')
  closeAccess(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: WorkflowActionDto) {
    return this.workflowsService.closeAccess(id, request.tenant!.id, request.user, dto);
  }

  @Post(':id/archive-record')
  @RequirePermissions('employees.update')
  archiveRecord(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: WorkflowActionDto) {
    return this.workflowsService.archiveRecord(id, request.tenant!.id, request.user, dto);
  }

  @Patch(':id/recompute')
  @RequirePermissions('employees.update')
  recompute(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.workflowsService.recomputeMasterWorkflow(id, request.tenant!.id, request.user);
  }
}
