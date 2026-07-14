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
import { TenantWide } from '../common/decorators/tenant-wide.decorator';

@Controller('vacancies')
@UseGuards(JwtAuthGuard, TenantGuard, ScopeGuard, PermissionGuard)
@TenantWide()
export class VacanciesController {
  constructor(private readonly vacanciesService: VacanciesService) {}

  @Post()
  @RequirePermissions('vacancies.create')
  create(@Req() request: RequestWithUser, @Body() dto: CreateVacancyDto) {
    return this.vacanciesService.create(request.tenant!.id, request.user.sub, dto);
  }

  @Get()
  @RequirePermissions('vacancies.read')
  findAll(@Req() request: RequestWithUser, @Query() query: ListVacanciesDto) {
    return this.vacanciesService.findAll(request.tenant!.id, query);
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
    return this.vacanciesService.findOne(id, request.tenant!.id);
  }

  @Patch(':id')
  @RequirePermissions('vacancies.update')
  update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateVacancyDto,
  ) {
    return this.vacanciesService.update(id, request.tenant!.id, dto);
  }
}
