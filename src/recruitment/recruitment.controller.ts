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
  CreateInterviewPoolDto,
  CreateInterviewResourceDto,
  CreateInterviewSchedulingRequestDto,
  CreateScorecardTemplateDto,
  UpdateScorecardTemplateAdminDto,
  DuplicateScorecardTemplateDto,
  ScorecardCompetencyDto,
  ReplaceScorecardAssignmentsDto,
  CreateExternalAssessmentDto,
  UpdateExternalAssessmentResultDto,
  AssignHiringManagerDto,
  DecideHiringManagerApprovalDto,
  RunBiasValidationDto,
  FinalizeDecisionCommitteeDto,
  ListInterviewsDto,
  ReplaceVacancyResponsiblesDto,
  ReplaceVacancyStagesDto,
  ScheduleInterviewDto,
  ScheduleInterviewSequenceDto,
  SubmitScorecardDto,
  UpdateInterviewDto,
  UpdateInterviewerProfileDto,
  RespondInterviewInvitationDto,
  UpdateAvailabilityDto,
  VoteDecisionCommitteeDto,
  SignAiCompetencyAssessmentDto,
} from "./dto/recruitment.dto";
import { CompetencyAiAssessmentService } from "./competency-ai-assessment.service";
import { InterviewCalendarService } from "./interview-calendar.service";
import { RecruitmentService } from "./recruitment.service";
import { ScorecardsService } from "./scorecards.service";
import { InterviewSelfSchedulingService } from "./interview-self-scheduling.service";

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
    private readonly selfScheduling: InterviewSelfSchedulingService,
    private readonly competencyAi: CompetencyAiAssessmentService,
  ) {}

  @Get("applications/:id/competency-ai-assessment")
  @RequirePermissions("applications.read")
  latestCompetencyAiAssessment(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string) {
    return this.competencyAi.latest(request.tenant!.id, actor, id);
  }

  @Post("applications/:id/competency-ai-assessment")
  @RequirePermissions("applications.update")
  generateCompetencyAiAssessment(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string) {
    return this.competencyAi.generate(request.tenant!.id, actor, id);
  }

  @Post("applications/:id/competency-ai-assessment/:assessmentId/sign")
  @RequirePermissions("applications.update")
  signCompetencyAiAssessment(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string, @Param("assessmentId") assessmentId: string, @Body() dto: SignAiCompetencyAssessmentDto) {
    return this.competencyAi.sign(request.tenant!.id, actor, id, assessmentId, dto);
  }

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

  @Post("interview-sequences")
  @RequirePermissions("applications.update")
  scheduleSequence(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Body() dto: ScheduleInterviewSequenceDto) {
    return this.service.scheduleSequence(request.tenant!.id, actor, dto);
  }

  @Get("interview-pools")
  @RequirePermissions("applications.read")
  pools(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload) {
    return this.service.listPools(request.tenant!.id, actor);
  }

  @Post("interview-pools")
  @RequirePermissions("applications.update")
  createPool(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Body() dto: CreateInterviewPoolDto) {
    return this.service.createPool(request.tenant!.id, actor, dto);
  }

  @Get("interview-resources")
  @RequirePermissions("applications.read")
  resources(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Query("branchId") branchId?: string) {
    return this.service.listResources(request.tenant!.id, actor, branchId);
  }

  @Post("interview-resources")
  @RequirePermissions("applications.update")
  createResource(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Body() dto: CreateInterviewResourceDto) {
    return this.service.createResource(request.tenant!.id, actor, dto);
  }

  @Get("interviewer-profiles")
  @RequirePermissions("applications.read")
  interviewerProfiles(@Req() request: RequestWithUser) {
    return this.service.listInterviewerProfiles(request.tenant!.id);
  }

  @Put("interviewer-profiles/:userId")
  @RequirePermissions("applications.update")
  updateInterviewerProfile(@Req() request: RequestWithUser, @Param("userId") userId: string, @Body() dto: UpdateInterviewerProfileDto) {
    return this.service.updateInterviewerProfile(request.tenant!.id, userId, dto);
  }

  @Post("interview-scheduling-requests")
  @RequirePermissions("applications.update")
  createSchedulingRequest(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Body() dto: CreateInterviewSchedulingRequestDto) {
    return this.selfScheduling.createRequest(request.tenant!.id, actor, dto);
  }

  @Get("coordination-queue")
  @RequirePermissions("applications.read")
  coordinationQueue(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    return this.service.coordinationQueue(request.tenant!.id, actor, Number(page ?? 1), Number(pageSize ?? 20));
  }

  @Patch("interviews/:id/participants/me")
  @RequirePermissions("applications.read")
  respondInvitation(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string, @Body() dto: RespondInterviewInvitationDto) {
    return this.service.respondToInvitation(request.tenant!.id, actor, id, dto.accepted);
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

  @Patch("scorecard-templates/:id")
  @RequirePermissions("vacancies.update")
  updateScorecardTemplate(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string, @Body() dto: UpdateScorecardTemplateAdminDto) {
    return this.scorecards.updateTemplateAdmin(request.tenant!.id, actor, id, dto);
  }

  @Post("scorecard-templates/:id/duplicate")
  @RequirePermissions("vacancies.update")
  duplicateScorecardTemplate(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string, @Body() dto: DuplicateScorecardTemplateDto) {
    return this.scorecards.duplicateTemplate(request.tenant!.id, actor, id, dto);
  }

  @Get("scorecard-competencies")
  @RequirePermissions("applications.read")
  scorecardCompetencies(@Req() request: RequestWithUser, @Query("includeInactive") includeInactive?: string) {
    return this.scorecards.listCompetencies(request.tenant!.id, includeInactive === "true");
  }

  @Post("scorecard-competencies")
  @RequirePermissions("vacancies.update")
  createScorecardCompetency(@Req() request: RequestWithUser, @Body() dto: ScorecardCompetencyDto) {
    return this.scorecards.upsertCompetency(request.tenant!.id, undefined, dto);
  }

  @Patch("scorecard-competencies/:id")
  @RequirePermissions("vacancies.update")
  updateScorecardCompetency(@Req() request: RequestWithUser, @Param("id") id: string, @Body() dto: ScorecardCompetencyDto) {
    return this.scorecards.upsertCompetency(request.tenant!.id, id, dto);
  }

  @Put("interviews/:id/scorecard-assignments")
  @RequirePermissions("applications.update")
  replaceScorecardAssignments(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string, @Body() dto: ReplaceScorecardAssignmentsDto) {
    return this.scorecards.replaceAssignments(request.tenant!.id, actor, id, dto);
  }

  @Get("applications/:id/external-assessments")
  @RequirePermissions("applications.read")
  externalAssessments(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string) {
    return this.scorecards.listExternalAssessments(request.tenant!.id, actor, id);
  }

  @Post("external-assessments")
  @RequirePermissions("applications.update")
  createExternalAssessment(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Body() dto: CreateExternalAssessmentDto) {
    return this.scorecards.createExternalAssessment(request.tenant!.id, actor, dto);
  }

  @Patch("external-assessments/:id/result")
  @RequirePermissions("applications.update")
  updateExternalAssessment(@Req() request: RequestWithUser, @Param("id") id: string, @Body() dto: UpdateExternalAssessmentResultDto) {
    return this.scorecards.updateExternalAssessment(request.tenant!.id, id, dto);
  }

  @Put("applications/:id/hiring-manager-approval")
  @RequirePermissions("applications.update")
  assignHiringManager(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string, @Body() dto: AssignHiringManagerDto) {
    return this.scorecards.assignHiringManager(request.tenant!.id, actor, id, dto);
  }

  @Get("applications/:id/hiring-manager-approval")
  @RequirePermissions("applications.read")
  hiringManagerApproval(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string) {
    return this.scorecards.getHiringManagerApproval(request.tenant!.id, actor, id);
  }

  @Post("applications/:id/hiring-manager-approval/decision")
  @RequirePermissions("applications.update")
  decideHiringManager(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param("id") id: string, @Body() dto: DecideHiringManagerApprovalDto) {
    return this.scorecards.decideHiringManager(request.tenant!.id, actor, id, dto);
  }

  @Get("scorecard-calibration")
  @RequirePermissions("applications.read")
  scorecardCalibration(@Req() request: RequestWithUser) {
    return this.scorecards.listCalibration(request.tenant!.id);
  }

  @Post("scorecard-calibration/run")
  @RequirePermissions("vacancies.update")
  calculateScorecardCalibration(@Req() request: RequestWithUser, @Query("startsAt") startsAt?: string, @Query("endsAt") endsAt?: string) {
    const end = endsAt ? new Date(endsAt) : new Date();
    const start = startsAt ? new Date(startsAt) : new Date(end.getTime() - 180 * 86_400_000);
    return this.scorecards.calculateCalibration(request.tenant!.id, start, end);
  }

  @Get("scorecard-bias-validations")
  @RequirePermissions("applications.read")
  biasValidations(@Req() request: RequestWithUser) {
    return this.scorecards.listBiasValidations(request.tenant!.id);
  }

  @Post("scorecard-bias-validations")
  @RequirePermissions("vacancies.update")
  runBiasValidation(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Body() dto: RunBiasValidationDto) {
    return this.scorecards.runBiasValidation(request.tenant!.id, actor, dto);
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

  @Get("calendar-providers")
  @RequirePermissions("applications.read")
  calendarProviders() {
    return this.calendars.listProviderConfiguration();
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
