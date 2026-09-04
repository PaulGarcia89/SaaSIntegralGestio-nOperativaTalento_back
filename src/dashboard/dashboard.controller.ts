import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestLocale } from '../common/decorators/request-locale.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { SupportedLocale } from '../localization/localization.service';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('operational')
  operational(@CurrentUser() user: JwtPayload, @RequestLocale() locale: SupportedLocale) {
    return this.dashboard.operational(user, locale);
  }
}
