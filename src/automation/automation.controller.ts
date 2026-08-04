import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { AutomationService } from './automation.service';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
import { ListAutomationAuditDto } from './dto/list-automation-audit.dto';
import { ListAutomationExecutionsDto } from './dto/list-automation-executions.dto';
import { ListAutomationRulesDto } from './dto/list-automation-rules.dto';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';
import { SimulateAutomationRuleDto } from './dto/simulate-automation-rule.dto';
import { BulkAutomationRulesDto } from './dto/bulk-automation-rules.dto';
import { BulkRetryExecutionsDto } from './dto/bulk-retry-executions.dto';

@Controller('automation')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard)
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get('catalog')
  @RequirePermissions('automation.read')
  getCatalog() {
    return this.automationService.getCatalog();
  }

  @Get('operations/overview')
  @RequirePermissions('automation.read')
  getOperationsOverview(@Req() request: RequestWithUser) {
    return this.automationService.getOperationsOverview(request.user);
  }

  @Post('rules/bulk')
  @RequirePermissions('automation.update')
  bulkRules(@Req() request: RequestWithUser, @Body() dto: BulkAutomationRulesDto) {
    return this.automationService.bulkRules(request.user, dto);
  }

  @Get('rules')
  @RequirePermissions('automation.read')
  listRules(@Req() request: RequestWithUser, @Query() query: ListAutomationRulesDto) {
    return this.automationService.listRules(request.user, query);
  }

  @Post('rules')
  @RequirePermissions('automation.create')
  createRule(@Req() request: RequestWithUser, @Body() dto: CreateAutomationRuleDto) {
    return this.automationService.createRule(request.user, dto);
  }

  @Patch('rules/:id')
  @RequirePermissions('automation.update')
  updateRule(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateAutomationRuleDto,
  ) {
    return this.automationService.updateRule(request.user, id, dto);
  }

  @Post('rules/:id/duplicate')
  @RequirePermissions('automation.create')
  duplicateRule(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.automationService.duplicateRule(request.user, id);
  }

  @Post('rules/:id/simulate')
  @RequirePermissions('automation.read')
  simulateRule(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: SimulateAutomationRuleDto,
  ) {
    return this.automationService.simulateRule(request.user, id, dto);
  }

  @Delete('rules/:id')
  @RequirePermissions('automation.update')
  deleteRule(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.automationService.deleteRule(request.user, id);
  }

  @Get('executions')
  @RequirePermissions('automation.read')
  listExecutions(@Req() request: RequestWithUser, @Query() query: ListAutomationExecutionsDto) {
    return this.automationService.listExecutions(request.user, query);
  }

  @Get('executions/:id')
  @RequirePermissions('automation.read')
  getExecution(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.automationService.getExecution(request.user, id);
  }

  @Post('executions/:id/retry')
  @RequirePermissions('automation.update')
  retryExecution(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.automationService.retryExecution(request.user, id);
  }

  @Post('executions/bulk-retry')
  @RequirePermissions('automation.update')
  bulkRetryExecutions(@Req() request: RequestWithUser, @Body() dto: BulkRetryExecutionsDto) {
    return this.automationService.bulkRetryExecutions(request.user, dto);
  }

  @Get('audit')
  @RequirePermissions('automation.audit.read')
  listAudit(@Req() request: RequestWithUser, @Query() query: ListAutomationAuditDto) {
    return this.automationService.listAudit(request.user, query);
  }
}
