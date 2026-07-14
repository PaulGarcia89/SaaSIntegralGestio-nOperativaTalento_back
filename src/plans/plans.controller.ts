import { ModuleCode } from '@prisma/client';
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('plans')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, PermissionGuard)
@RequireModule(ModuleCode.ATS)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post()
  @RequirePermissions('plans.create')
  create(@Body() dto: CreatePlanDto, @CurrentUser() user: JwtPayload) {
    return this.plansService.create(dto, user);
  }

  @Get()
  @RequirePermissions('plans.read')
  findAll() {
    return this.plansService.findAll();
  }

  @Get(':id')
  @RequirePermissions('plans.read')
  findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('plans.update')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto, @CurrentUser() user: JwtPayload) {
    return this.plansService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('plans.delete')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.plansService.remove(id, user);
  }
}
