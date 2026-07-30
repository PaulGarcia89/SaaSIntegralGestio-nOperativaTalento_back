import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { CreateVacancyDto } from './dto/create-vacancy.dto';
import { ListVacanciesDto } from './dto/list-vacancies.dto';
import { UpdateVacancyDto } from './dto/update-vacancy.dto';
import { CreateVacancyFormTemplateDto } from './dto/create-vacancy-form-template.dto';
import { VacanciesService } from './vacancies.service';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { ModuleCode } from '@prisma/client';

@Controller('vacancies')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, ScopeGuard, PermissionGuard)
@RequireModule(ModuleCode.ATS)
export class VacanciesController {
  constructor(private readonly vacanciesService: VacanciesService) {}

  @Post()
  @RequirePermissions('vacancies.create')
  create(@Req() request: RequestWithUser, @Body() dto: CreateVacancyDto) {
    return this.vacanciesService.create(request.tenant!.id, request.user, dto);
  }

  @Get()
  @RequirePermissions('vacancies.read')
  findAll(@Req() request: RequestWithUser, @Query() query: ListVacanciesDto) {
    return this.vacanciesService.findAll(request.tenant!.id, request.user, query);
  }

  @Get('form-templates')
  @RequirePermissions('vacancies.read')
  listTemplates(@Req() request: RequestWithUser) {
    return this.vacanciesService.listFormTemplates(request.tenant!.id);
  }

  @Post('form-templates')
  @RequirePermissions('vacancies.create')
  createTemplate(@Req() request: RequestWithUser, @Body() dto: CreateVacancyFormTemplateDto) {
    return this.vacanciesService.createFormTemplate(request.tenant!.id, dto);
  }

  @Patch('form-templates/:id/delete')
  @RequirePermissions('vacancies.update')
  deleteTemplate(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.vacanciesService.deleteFormTemplate(id, request.tenant!.id);
  }

  @Get(':id')
  @RequirePermissions('vacancies.read')
  findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.vacanciesService.findOne(id, request.tenant!.id, request.user);
  }

  @Patch(':id')
  @RequirePermissions('vacancies.update')
  update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateVacancyDto,
  ) {
    return this.vacanciesService.update(id, request.tenant!.id, request.user, dto);
  }
}
