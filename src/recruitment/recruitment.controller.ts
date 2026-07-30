import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ModuleCode } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequestWithUser } from '../common/types/request-with-user.type';
import {
  ListInterviewsDto,
  ReplaceVacancyResponsiblesDto,
  ReplaceVacancyStagesDto,
  ScheduleInterviewDto,
  SubmitScorecardDto,
  UpdateInterviewDto,
} from './dto/recruitment.dto';
import { RecruitmentService } from './recruitment.service';

@Controller('recruitment')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, ScopeGuard, PermissionGuard)
@RequireModule(ModuleCode.ATS)
export class RecruitmentController {
  constructor(private readonly service: RecruitmentService) {}

  @Get('vacancies/:id/setup')
  @RequirePermissions('vacancies.read')
  getSetup(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.getVacancySetup(request.tenant!.id, id);
  }

  @Put('vacancies/:id/stages')
  @RequirePermissions('vacancies.update')
  replaceStages(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: ReplaceVacancyStagesDto) {
    return this.service.replaceStages(request.tenant!.id, id, dto);
  }

  @Put('vacancies/:id/responsibles')
  @RequirePermissions('vacancies.update')
  replaceResponsibles(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: ReplaceVacancyResponsiblesDto) {
    return this.service.replaceResponsibles(request.tenant!.id, id, dto);
  }

  @Get('interviews')
  @RequirePermissions('applications.read')
  listInterviews(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Query() query: ListInterviewsDto) {
    return this.service.listInterviews(request.tenant!.id, actor, query);
  }

  @Post('interviews')
  @RequirePermissions('applications.update')
  schedule(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Body() dto: ScheduleInterviewDto) {
    return this.service.scheduleInterview(request.tenant!.id, actor, dto);
  }

  @Patch('interviews/:id')
  @RequirePermissions('applications.update')
  update(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateInterviewDto) {
    return this.service.updateInterview(request.tenant!.id, id, dto);
  }

  @Put('interviews/:id/scorecard')
  @RequirePermissions('applications.update')
  score(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body() dto: SubmitScorecardDto) {
    return this.service.submitScorecard(request.tenant!.id, actor, id, dto);
  }
}
