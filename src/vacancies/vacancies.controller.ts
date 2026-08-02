import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { ModuleCode, PersonnelRequisitionStatus } from '@prisma/client';
import { DeleteVacancyImageDto } from './dto/vacancy-image.dto';
import { PersonnelRequisitionsService } from './personnel-requisitions.service';
import {
  CreatePersonnelRequisitionDto,
  DecidePersonnelRequisitionDto,
  VacancyActionDto,
} from './dto/personnel-requisition.dto';

@Controller('vacancies')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, ScopeGuard, PermissionGuard)
@RequireModule(ModuleCode.ATS)
export class VacanciesController {
  constructor(
    private readonly vacanciesService: VacanciesService,
    private readonly requisitionsService: PersonnelRequisitionsService,
  ) {}

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

  @Post('requisitions')
  @RequirePermissions('vacancies.create')
  createRequisition(@Req() request: RequestWithUser, @Body() dto: CreatePersonnelRequisitionDto) {
    return this.requisitionsService.create(request.tenant!.id, request.user, dto);
  }

  @Get('requisitions/list')
  @RequirePermissions('vacancies.read')
  listRequisitions(
    @Req() request: RequestWithUser,
    @Query('status') status?: PersonnelRequisitionStatus,
  ) {
    return this.requisitionsService.list(request.tenant!.id, request.user, status);
  }

  @Post('requisitions/:id/approve')
  @RequirePermissions('vacancies.update')
  approveRequisition(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: DecidePersonnelRequisitionDto,
  ) {
    return this.requisitionsService.decide(id, request.tenant!.id, request.user, true, dto.note);
  }

  @Post('requisitions/:id/reject')
  @RequirePermissions('vacancies.update')
  rejectRequisition(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: DecidePersonnelRequisitionDto,
  ) {
    return this.requisitionsService.decide(id, request.tenant!.id, request.user, false, dto.note);
  }

  @Post(':id/clone')
  @RequirePermissions('vacancies.create')
  clone(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: VacancyActionDto,
  ) {
    return this.vacanciesService.clone(id, request.tenant!.id, request.user, dto.reason);
  }

  @Post(':id/archive')
  @RequirePermissions('vacancies.update')
  archive(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: VacancyActionDto,
  ) {
    return this.vacanciesService.archive(id, request.tenant!.id, request.user, dto.reason);
  }

  @Get(':id/history')
  @RequirePermissions('vacancies.read')
  history(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.vacanciesService.history(id, request.tenant!.id, request.user);
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

  @Post(':id/image')
  @RequirePermissions('vacancies.update')
  @UseInterceptors(FileInterceptor('image', {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  }))
  uploadImage(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.vacanciesService.uploadImage(id, request.tenant!.id, request.user, file);
  }

  @Get(':id/image/versions')
  @RequirePermissions('vacancies.read')
  imageVersions(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.vacanciesService.listImageVersions(id, request.tenant!.id, request.user);
  }

  @Delete(':id/image/:imageId')
  @RequirePermissions('vacancies.update')
  deleteImage(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @Body() dto: DeleteVacancyImageDto,
  ) {
    return this.vacanciesService.deleteImage(
      id,
      imageId,
      request.tenant!.id,
      request.user,
      dto.reason,
    );
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
