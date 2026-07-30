import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { MetricsService } from './metrics.service';
import { AuditAction } from '../audit/audit-action.decorator';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { GlobalOnly } from '../common/decorators/global-only.decorator';
import { ScopeGuard } from '../common/guards/scope.guard';

@Controller('metrics')
@UseGuards(JwtAuthGuard, ScopeGuard, PermissionGuard)
@RequirePermissions('metrics.read')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('tenant-activity')
  @GlobalOnly()
  @AuditAction('METRICS_TENANT_ACTIVITY')
  getTenantActivity(
    @CurrentUser() user: JwtPayload,
    @Query('minutes') minutes?: string,
  ) {
    const parsedMinutes = minutes ? Number(minutes) : undefined;
    return this.metricsService.getTenantActivity(user, parsedMinutes);
  }

  @Get('active-tenants')
  @GlobalOnly()
  @AuditAction('METRICS_ACTIVE_TENANTS')
  getActiveTenants(
    @CurrentUser() user: JwtPayload,
    @Query('minutes') minutes?: string,
  ) {
    const parsedMinutes = minutes ? Number(minutes) : undefined;
    return this.metricsService.getActiveTenants(user, parsedMinutes);
  }

  @Get('active-users-by-tenant')
  @GlobalOnly()
  @AuditAction('METRICS_ACTIVE_USERS_BY_TENANT')
  getActiveUsersByTenant(
    @CurrentUser() user: JwtPayload,
    @Query('minutes') minutes?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const parsedMinutes = minutes ? Number(minutes) : undefined;
    return this.metricsService.getActiveUsersByTenant(user, parsedMinutes, tenantId);
  }

  @Get('last-access-by-tenant')
  @GlobalOnly()
  @AuditAction('METRICS_LAST_ACCESS_BY_TENANT')
  getLastAccessByTenant(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.metricsService.getLastAccessByTenant(user, parsedLimit);
  }

  @Get('login-activity')
  @GlobalOnly()
  @AuditAction('METRICS_LOGIN_ACTIVITY')
  getLoginActivity(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.metricsService.getLoginActivity(user, from, to, tenantId);
  }

  @Get('active-branches')
  @GlobalOnly()
  @AuditAction('METRICS_ACTIVE_BRANCHES')
  getActiveBranches(
    @CurrentUser() user: JwtPayload,
    @Query('minutes') minutes?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const parsedMinutes = minutes ? Number(minutes) : undefined;
    return this.metricsService.getActiveBranches(user, parsedMinutes, tenantId);
  }

  @Get('active-users-by-branch')
  @GlobalOnly()
  @AuditAction('METRICS_ACTIVE_USERS_BY_BRANCH')
  getActiveUsersByBranch(
    @CurrentUser() user: JwtPayload,
    @Query('minutes') minutes?: string,
    @Query('tenantId') tenantId?: string,
    @Query('branchId') branchId?: string,
  ) {
    const parsedMinutes = minutes ? Number(minutes) : undefined;
    return this.metricsService.getActiveUsersByBranch(user, parsedMinutes, tenantId, branchId);
  }

  @Get('last-access-by-branch')
  @GlobalOnly()
  @AuditAction('METRICS_LAST_ACCESS_BY_BRANCH')
  getLastAccessByBranch(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.metricsService.getLastAccessByBranch(user, parsedLimit, tenantId);
  }

  @Get('branch-request-activity')
  @GlobalOnly()
  @AuditAction('METRICS_BRANCH_REQUEST_ACTIVITY')
  getBranchRequestActivity(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tenantId') tenantId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.metricsService.getBranchRequestActivity(user, from, to, tenantId, branchId);
  }

  @Get('queue-overview')
  @RequirePermissions('metrics.operations.read')
  @AuditAction('METRICS_QUEUE_OVERVIEW')
  getQueueOverview(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.metricsService.getQueueOverview(user, from, to, tenantId);
  }

  @Get('dead-letter')
  @RequirePermissions('metrics.operations.read')
  @AuditAction('METRICS_DEAD_LETTER')
  getDeadLetter(
    @CurrentUser() user: JwtPayload,
    @Query('tenantId') tenantId?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.metricsService.getDeadLetterEvents(user, tenantId, parsedLimit);
  }

  @Get('throughput-by-domain')
  @RequirePermissions('metrics.operations.read')
  @AuditAction('METRICS_THROUGHPUT_BY_DOMAIN')
  getThroughputByDomain(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.metricsService.getThroughputByDomain(user, from, to, tenantId);
  }

  @Get('queue-errors-by-tenant')
  @RequirePermissions('metrics.operations.read')
  @AuditAction('METRICS_QUEUE_ERRORS_BY_TENANT')
  getQueueErrorsByTenant(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.metricsService.getQueueErrorsByTenant(user, from, to, tenantId);
  }
}
