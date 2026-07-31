import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { CalendarProvider, ModuleCode } from "@prisma/client";
import { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireModule } from "../common/decorators/module-access.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtPayload } from "../common/interfaces/jwt-payload.interface";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../common/guards/module-access.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { ScopeGuard } from "../common/guards/scope.guard";
import { SubscriptionGuard } from "../common/guards/subscription.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { RequestWithUser } from "../common/types/request-with-user.type";
import {
  AvailabilityQueryDto,
  CalendarAuthorizationQueryDto,
  CalendarOAuthDto,
  CreateDecisionCommitteeDto,
  CreateScorecardTemplateDto,
  FinalizeDecisionCommitteeDto,
  ListInterviewsDto,
  ReplaceVacancyResponsiblesDto,
  ReplaceVacancyStagesDto,
  ScheduleInterviewDto,
  SubmitScorecardDto,
  UpdateInterviewDto,
  UpdateAvailabilityDto,
  VoteDecisionCommitteeDto,
} from "./dto/recruitment.dto";
import { InterviewCalendarService } from "./interview-calendar.service";
import { RecruitmentService } from "./recruitment.service";
import { ScorecardsService } from "./scorecards.service";

@Controller("recruitment")
@UseGuards(
  JwtAuthGuard,
  TenantGuard,
  SubscriptionGuard,
  ModuleAccessGuard,
  ScopeGuard,
  PermissionGuard,
)
@RequireModule(ModuleCode.ATS)
export class RecruitmentController {
  constructor(
    private readonly service: RecruitmentService,
    private readonly calendars: InterviewCalendarService,
    private readonly scorecards: ScorecardsService,
  ) {}

  @Get("vacancies/:id/setup")
  @RequirePermissions("vacancies.read")
  getSetup(@Req() request: RequestWithUser, @Param("id") id: string) {
    return this.service.getVacancySetup(request.tenant!.id, request.user, id);
  }

  @Put("vacancies/:id/stages")
  @RequirePermissions("vacancies.update")
  replaceStages(
    @Req() request: RequestWithUser,
    @Param("id") id: string,
    @Body() dto: ReplaceVacancyStagesDto,
  ) {
    return this.service.replaceStages(
      request.tenant!.id,
      request.user,
      id,
      dto,
    );
  }

  @Put("vacancies/:id/responsibles")
  @RequirePermissions("vacancies.update")
  replaceResponsibles(
    @Req() request: RequestWithUser,
    @Param("id") id: string,
    @Body() dto: ReplaceVacancyResponsiblesDto,
  ) {
    return this.service.replaceResponsibles(
      request.tenant!.id,
      request.user,
      id,
      dto,
    );
  }

  @Get("interviews")
  @RequirePermissions("applications.read")
  listInterviews(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Query() query: ListInterviewsDto,
  ) {
    return this.service.listInterviews(request.tenant!.id, actor, query);
  }

  @Post("interviews")
  @RequirePermissions("applications.update")
  schedule(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Body() dto: ScheduleInterviewDto,
  ) {
    return this.service.scheduleInterview(request.tenant!.id, actor, dto);
  }

  @Patch("interviews/:id")
  @RequirePermissions("applications.update")
  update(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateInterviewDto,
  ) {
    return this.service.updateInterview(request.tenant!.id, actor, id, dto);
  }

  @Put("interviews/:id/scorecard")
  @RequirePermissions("applications.update")
  score(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
    @Body() dto: SubmitScorecardDto,
  ) {
    return this.scorecards.submit(request.tenant!.id, actor, id, dto);
  }

  @Get("scorecard-templates")
  @RequirePermissions("applications.read")
  listScorecardTemplates(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Query("vacancyId") vacancyId: string,
    @Query("stageId") stageId?: string,
  ) {
    return this.scorecards.listTemplates(
      request.tenant!.id,
      actor,
      vacancyId,
      stageId,
    );
  }

  @Post("scorecard-templates")
  @RequirePermissions("vacancies.update")
  createScorecardTemplate(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Body() dto: CreateScorecardTemplateDto,
  ) {
    return this.scorecards.createTemplate(request.tenant!.id, actor, dto);
  }

  @Get("interviews/:id/scorecard-context")
  @RequirePermissions("applications.read")
  scorecardContext(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
  ) {
    return this.scorecards.getInterviewContext(request.tenant!.id, actor, id);
  }

  @Get("interviews/:id/scorecard-comparison")
  @RequirePermissions("applications.read")
  scorecardComparison(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
  ) {
    return this.scorecards.comparisonForInterview(
      request.tenant!.id,
      actor,
      id,
    );
  }

  @Post("decision-committees")
  @RequirePermissions("applications.update")
  createDecisionCommittee(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Body() dto: CreateDecisionCommitteeDto,
  ) {
    return this.scorecards.createCommittee(request.tenant!.id, actor, dto);
  }

  @Get("applications/:id/decision-committee")
  @RequirePermissions("applications.read")
  decisionCommittee(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
  ) {
    return this.scorecards.getCommittee(request.tenant!.id, actor, id);
  }

  @Post("decision-committees/:id/vote")
  @RequirePermissions("applications.update")
  voteDecisionCommittee(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
    @Body() dto: VoteDecisionCommitteeDto,
  ) {
    return this.scorecards.vote(request.tenant!.id, actor, id, dto);
  }

  @Post("decision-committees/:id/finalize")
  @RequirePermissions("applications.update")
  finalizeDecisionCommittee(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
    @Body() dto: FinalizeDecisionCommitteeDto,
  ) {
    return this.scorecards.finalizeCommittee(
      request.tenant!.id,
      actor,
      id,
      dto,
    );
  }

  @Get("calendar-connections")
  @RequirePermissions("applications.read")
  calendarConnections(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.calendars.listConnections(request.tenant!.id, actor);
  }

  @Get("calendar-connections/:provider/authorize")
  @RequirePermissions("applications.read")
  authorizeCalendar(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Param("provider", new ParseEnumPipe(CalendarProvider))
    provider: CalendarProvider,
    @Query() query: CalendarAuthorizationQueryDto,
  ) {
    return this.calendars.getAuthorizationUrl(
      request.tenant!.id,
      actor,
      provider,
      query.redirectUri,
    );
  }

  @Post("calendar-connections/:provider/oauth")
  @RequirePermissions("applications.read")
  completeCalendarOAuth(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Param("provider", new ParseEnumPipe(CalendarProvider))
    provider: CalendarProvider,
    @Body() dto: CalendarOAuthDto,
  ) {
    return this.calendars.exchangeAuthorizationCode(
      request.tenant!.id,
      actor,
      provider,
      dto,
    );
  }

  @Delete("calendar-connections/:provider")
  @RequirePermissions("applications.read")
  disconnectCalendar(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Param("provider", new ParseEnumPipe(CalendarProvider))
    provider: CalendarProvider,
  ) {
    return this.calendars.disconnect(request.tenant!.id, actor, provider);
  }

  @Get("interviewers/:id/availability")
  @RequirePermissions("applications.read")
  interviewerAvailability(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.calendars.getAvailability(request.tenant!.id, actor, id, query);
  }

  @Get("availability/settings")
  @RequirePermissions("applications.read")
  availabilitySettings(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.calendars.getAvailabilitySettings(request.tenant!.id, actor);
  }

  @Put("availability/settings")
  @RequirePermissions("applications.read")
  updateAvailabilitySettings(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.calendars.updateAvailabilitySettings(
      request.tenant!.id,
      actor,
      dto,
    );
  }

  @Post("interviews/:id/calendar/retry")
  @RequirePermissions("applications.update")
  retryCalendarSync(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
  ) {
    return this.calendars.retrySync(request.tenant!.id, actor, id);
  }

  @Get("interviews/:id/invitation.ics")
  @RequirePermissions("applications.read")
  async invitationIcs(
    @Req() request: RequestWithUser,
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const invitation = await this.calendars.generateIcs(
      request.tenant!.id,
      actor,
      id,
    );
    response.setHeader("content-type", "text/calendar; charset=utf-8");
    response.setHeader(
      "content-disposition",
      `attachment; filename="${invitation.filename}"`,
    );
    return invitation.content;
  }
}
