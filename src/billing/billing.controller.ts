import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { BillingService } from './billing.service';
import { UpsertBillingCustomerDto } from './dto/upsert-billing-customer.dto';

@Controller('billing')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('overview')
  @RequirePermissions('subscriptions.read')
  getOverview(@CurrentUser() user: JwtPayload) {
    return this.billingService.getOverview(user);
  }

  @Get('invoices')
  @RequirePermissions('subscriptions.read')
  findInvoices(@CurrentUser() user: JwtPayload) {
    return this.billingService.findInvoices(user);
  }

  @Put('customer')
  @RequirePermissions('subscriptions.update')
  upsertCustomer(@CurrentUser() user: JwtPayload, @Body() dto: UpsertBillingCustomerDto) {
    return this.billingService.upsertCustomer(user, dto);
  }
}
