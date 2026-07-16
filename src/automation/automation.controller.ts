import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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

@Controller('automation')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard)
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

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

  @Get('audit')
  @RequirePermissions('automation.audit.read')
  listAudit(@Req() request: RequestWithUser, @Query() query: ListAutomationAuditDto) {
    return this.automationService.listAudit(request.user, query);
  }
}
