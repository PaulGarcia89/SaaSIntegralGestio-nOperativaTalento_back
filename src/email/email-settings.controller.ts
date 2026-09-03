import { Body, Controller, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { EmailSettingsService } from './email-settings.service';
import { TestEmailSettingsDto, UpdateEmailSettingsDto } from './email-settings.dto';

@Controller('company/email-settings')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ScopeGuard, PermissionGuard)
export class EmailSettingsController {
  constructor(private readonly service: EmailSettingsService) {}

  @Get()
  @RequirePermissions('tenants.read')
  get(@Req() req: RequestWithUser) { return this.service.get(req.tenant!.id); }

  @Put()
  @RequirePermissions('tenants.update')
  save(@Req() req: RequestWithUser, @Body() dto: UpdateEmailSettingsDto) { return this.service.save(req.tenant!.id, dto); }

  @Post('test')
  @RequirePermissions('tenants.update')
  test(@CurrentUser() user: JwtPayload, @Req() req: RequestWithUser, @Body() dto: TestEmailSettingsDto) { return this.service.test(req.tenant!.id, dto.recipient || user.email); }
}
