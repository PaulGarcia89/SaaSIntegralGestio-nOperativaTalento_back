import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('operational')
  operational(@CurrentUser() user: JwtPayload) {
    return this.dashboard.operational(user);
  }
}
