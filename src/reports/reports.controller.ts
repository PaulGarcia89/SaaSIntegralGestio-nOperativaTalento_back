import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

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
}
