import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { ReportQueryDto } from './dto/report-query.dto';
import { AtsAnalyticsQueryDto, SaveAtsAnalyticsDashboardDto, UpsertHiringQualityReviewDto, UpsertRecruitmentSourceCostDto } from './dto/ats-analytics-query.dto';
import { SaveReportFilterDto } from './dto/save-report-filter.dto';
import { AtsAnalyticsService } from './ats-analytics.service';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly atsAnalytics: AtsAnalyticsService,
  ) {}

  @Get('overview')
  @RequirePermissions('metrics.read')
  overview(@CurrentUser() actor: JwtPayload, @Query() query: ReportQueryDto) {
    return this.reports.overview(actor, query);
  }

  @Get('export')
  @RequirePermissions('applications.export')
  export(@CurrentUser() actor: JwtPayload, @Query() query: ReportQueryDto) {
    return this.reports.exportCsv(actor, query);
  }

  @Get('saved-filters')
  @RequirePermissions('metrics.read')
  savedFilters(@CurrentUser() actor: JwtPayload) {
    return this.reports.listSavedFilters(actor);
  }

  @Post('saved-filters')
  @RequirePermissions('metrics.read')
  saveFilter(@CurrentUser() actor: JwtPayload, @Body() dto: SaveReportFilterDto) {
    return this.reports.saveFilter(actor, dto);
  }

  @Delete('saved-filters/:id')
  @RequirePermissions('metrics.read')
  deleteFilter(@CurrentUser() actor: JwtPayload, @Param('id') id: string) {
    return this.reports.deleteFilter(actor, id);
  }

  @Get('ats-analytics')
  @RequirePermissions('applications.read')
  atsOverview(@CurrentUser() actor: JwtPayload, @Query() query: AtsAnalyticsQueryDto) {
    return this.atsAnalytics.overview(actor, query);
  }

  @Get('ats-analytics/export')
  @RequirePermissions('applications.export')
  atsExport(@CurrentUser() actor: JwtPayload, @Query() query: AtsAnalyticsQueryDto) {
    return this.atsAnalytics.exportCsv(actor, query);
  }

  @Get('ats-analytics/dashboards')
  @RequirePermissions('applications.read')
  dashboards(@CurrentUser() actor: JwtPayload) { return this.atsAnalytics.listDashboards(actor); }

  @Post('ats-analytics/dashboards')
  @RequirePermissions('applications.read')
  saveDashboard(@CurrentUser() actor: JwtPayload, @Body() dto: SaveAtsAnalyticsDashboardDto) { return this.atsAnalytics.saveDashboard(actor, dto); }

  @Get('ats-analytics/source-costs')
  @RequirePermissions('applications.read')
  sourceCosts(@CurrentUser() actor: JwtPayload) { return this.atsAnalytics.listSourceCosts(actor); }

  @Post('ats-analytics/source-costs')
  @RequirePermissions('applications.update')
  upsertSourceCost(@CurrentUser() actor: JwtPayload, @Body() dto: UpsertRecruitmentSourceCostDto) { return this.atsAnalytics.upsertSourceCost(actor, dto); }

  @Get('ats-analytics/hiring-quality')
  @RequirePermissions('applications.read')
  hiringQuality(@CurrentUser() actor: JwtPayload) { return this.atsAnalytics.listHiringQuality(actor); }

  @Post('ats-analytics/hiring-quality')
  @RequirePermissions('applications.update')
  upsertHiringQuality(@CurrentUser() actor: JwtPayload, @Body() dto: UpsertHiringQualityReviewDto) { return this.atsAnalytics.upsertHiringQuality(actor, dto); }
}
