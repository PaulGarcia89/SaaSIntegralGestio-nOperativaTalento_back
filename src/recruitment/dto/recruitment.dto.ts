import {
  ApplicationStatus,
  CalendarProvider,
  DecisionCommitteeRole,
  InterviewRecommendation,
  InterviewParticipantRole,
  InterviewResourceType,
  InterviewerTrainingStatus,
  InterviewStatus,
  InterviewType,
  ScorecardCriterionType,
  ScorecardFeedbackVisibility,
  ScorecardTemplateScope,
  ExternalAssessmentStatus,
  HiringManagerApprovalStatus,
  VideoConferenceProvider,
  VacancyResponsibleRole,
} from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { OffsetPaginationQueryDto } from "../../common/dto/offset-pagination-query.dto";

export class VacancyStageInputDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  position!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsEnum(ApplicationStatus)
  applicationStatus?: ApplicationStatus;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  allowedNextStageCodes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  requiredFields?: string[];

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  requiredApprovals?: number;

  @IsOptional()
  @IsBoolean()
  allowReopen?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  slaHours?: number;

  @IsOptional()
  @IsBoolean()
  isTerminal?: boolean;
}

export class ReplaceVacancyStagesDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => VacancyStageInputDto)
  stages!: VacancyStageInputDto[];
}

export class VacancyResponsibleInputDto {
  @IsUUID()
  userId!: string;

  @IsEnum(VacancyResponsibleRole)
  role!: VacancyResponsibleRole;
}

export class ReplaceVacancyResponsiblesDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => VacancyResponsibleInputDto)
  responsibles!: VacancyResponsibleInputDto[];
}

export class ListInterviewsDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsUUID()
  applicationId?: string;

  @IsOptional()
  @IsUUID()
  vacancyId?: string;

  @IsOptional()
  @IsUUID()
  interviewerUserId?: string;

  @IsOptional()
  @IsEnum(InterviewStatus)
  status?: InterviewStatus;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @IsOptional()
  @IsUUID()
  sequenceId?: string;

  @IsOptional()
  @IsString()
  startsFrom?: string;

  @IsOptional()
  @IsString()
  startsTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
}

export class ScheduleInterviewDto {
  @IsUUID()
  applicationId!: string;

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsUUID()
  interviewerUserId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  participantUserIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  shadowUserIds?: string[];

  @IsOptional()
  @IsUUID()
  poolId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  resourceIds?: string[];

  @IsOptional()
  @IsUUID()
  sequenceId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  sequenceOrder?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @IsEnum(InterviewType)
  type!: InterviewType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  timezone!: string;

  @IsString()
  startsAt!: string;

  @IsString()
  endsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(1000)
  meetingUrl?: string;

  @IsOptional()
  @IsEnum(CalendarProvider)
  calendarProvider?: CalendarProvider;

  @IsOptional()
  @IsEnum(VideoConferenceProvider)
  videoProvider?: VideoConferenceProvider;

  @IsOptional()
  @IsBoolean()
  allowConflict?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class UpdateInterviewDto {
  @IsOptional()
  @IsEnum(InterviewStatus)
  status?: InterviewStatus;

  @IsOptional()
  @IsString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(1000)
  meetingUrl?: string;

  @IsOptional()
  @IsEnum(CalendarProvider)
  calendarProvider?: CalendarProvider;

  @IsOptional()
  @IsEnum(VideoConferenceProvider)
  videoProvider?: VideoConferenceProvider;

  @IsOptional()
  @IsBoolean()
  allowConflict?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class InterviewSequenceRoundDto extends ScheduleInterviewDto {}

export class ScheduleInterviewSequenceDto {
  @IsUUID()
  applicationId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => InterviewSequenceRoundDto)
  rounds!: InterviewSequenceRoundDto[];
}

export class CreateInterviewPoolMemberDto {
  @IsUUID()
  userId!: string;

  @IsEnum(InterviewParticipantRole)
  defaultRole!: InterviewParticipantRole;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  priority?: number;
}

export class CreateInterviewPoolDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateInterviewPoolMemberDto)
  members!: CreateInterviewPoolMemberDto[];
}

export class CreateInterviewResourceDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsEnum(InterviewResourceType)
  type!: InterviewResourceType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  capacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;
}

export class UpdateInterviewerProfileDto {
  @IsEnum(InterviewerTrainingStatus)
  trainingStatus!: InterviewerTrainingStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  shadowSessionsRequired?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  maxInterviewsPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  maxInterviewsPerWeek?: number;

  @IsOptional()
  @IsBoolean()
  autoSubstitutionEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  specialties?: string[];
}

export class CreateInterviewSchedulingRequestDto {
  @IsUUID()
  applicationId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @IsEnum(InterviewType)
  type!: InterviewType;

  @IsString()
  @MaxLength(100)
  timezone!: string;

  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes!: number;

  @IsString()
  windowStartsAt!: string;

  @IsString()
  windowEndsAt!: string;

  @IsOptional()
  @IsUUID()
  poolId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  interviewerUserIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  shadowUserIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  resourceIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  expiresInDays?: number;
}

export class BookInterviewSlotDto {
  @IsString()
  startsAt!: string;
}

export class RespondInterviewInvitationDto {
  @IsBoolean()
  accepted!: boolean;
}

export class CalendarOAuthDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsUrl({ require_tld: false })
  redirectUri!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;
}

export class CalendarAuthorizationQueryDto {
  @IsUrl({ require_tld: false })
  redirectUri!: string;
}

export class AvailabilityQueryDto {
  @IsString()
  startsAt!: string;

  @IsString()
  endsAt!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes?: number;
}

export class UpdateAvailabilityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  timezone!: string;

  @IsObject()
  weeklySchedule!: Record<string, Array<{ start: string; end: string }>>;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  bufferMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(336)
  minNoticeHours?: number;
}

export class SubmitScorecardDto {
  @IsOptional()
  @IsObject()
  criteria?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ScorecardResponseInputDto)
  responses?: ScorecardResponseInputDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  overallRating?: number;

  @IsEnum(InterviewRecommendation)
  recommendation!: InterviewRecommendation;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  strengths?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  concerns?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comments?: string;

  @IsOptional()
  @IsBoolean()
  sign?: boolean;
}

export class ScorecardResponseInputDto {
  @IsUUID()
  criterionId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  textValue?: string;

  @IsOptional()
  @IsBoolean()
  booleanValue?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  evidence?: string;
}

export class ScorecardCriterionInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  competencyCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  competencyName?: string;

  @IsOptional()
  @IsUUID()
  competencyId?: string;

  @IsEnum(ScorecardCriterionType)
  type!: ScorecardCriterionType;

  @IsInt()
  @Min(0)
  @Max(100)
  weight!: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresEvidence?: boolean;

  @IsOptional()
  @IsObject()
  ratingAnchors?: Record<string, string>;
}

export class CreateScorecardTemplateDto {
  @IsOptional()
  @IsUUID()
  vacancyId?: string;

  @IsOptional()
  @IsEnum(ScorecardTemplateScope)
  scope?: ScorecardTemplateScope;

  @IsOptional()
  @IsEnum(ScorecardFeedbackVisibility)
  feedbackVisibility?: ScorecardFeedbackVisibility;

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructions?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ScorecardCriterionInputDto)
  criteria!: ScorecardCriterionInputDto[];
}

export class UpdateScorecardTemplateAdminDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(ScorecardFeedbackVisibility)
  feedbackVisibility?: ScorecardFeedbackVisibility;
}

export class DuplicateScorecardTemplateDto {
  @IsOptional()
  @IsUUID()
  vacancyId?: string;

  @IsOptional()
  @IsEnum(ScorecardTemplateScope)
  scope?: ScorecardTemplateScope;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;
}

export class ScorecardCompetencyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsObject()
  behavioralAnchors?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ScorecardEvaluatorAssignmentInputDto {
  @IsUUID()
  evaluatorUserId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  criterionIds!: string[];

  @IsOptional()
  @IsBoolean()
  anonymousReview?: boolean;
}

export class ReplaceScorecardAssignmentsDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ScorecardEvaluatorAssignmentInputDto)
  assignments!: ScorecardEvaluatorAssignmentInputDto[];
}

export class CreateExternalAssessmentDto {
  @IsUUID()
  applicationId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  provider!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  assessmentType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  externalAssessmentId?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  launchUrl?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsBoolean()
  consentRecorded!: boolean;
}

export class UpdateExternalAssessmentResultDto {
  @IsEnum(ExternalAssessmentStatus)
  status!: ExternalAssessmentStatus;

  @IsOptional()
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentile?: number;

  @IsOptional()
  @IsUrl({ require_tld: false })
  reportUrl?: string;

  @IsOptional()
  @IsObject()
  result?: Record<string, unknown>;
}

export class AssignHiringManagerDto {
  @IsUUID()
  managerUserId!: string;
}

export class DecideHiringManagerApprovalDto {
  @IsEnum(HiringManagerApprovalStatus)
  status!: HiringManagerApprovalStatus;

  @IsEnum(InterviewRecommendation)
  recommendation!: InterviewRecommendation;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  rationale!: string;
}

export class BiasValidationGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsInt()
  @Min(1)
  total!: number;

  @IsInt()
  @Min(0)
  selected!: number;
}

export class RunBiasValidationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  populationField!: string;

  @ValidateNested()
  @Type(() => BiasValidationGroupDto)
  referenceGroup!: BiasValidationGroupDto;

  @ValidateNested()
  @Type(() => BiasValidationGroupDto)
  comparisonGroup!: BiasValidationGroupDto;
}

export class CreateDecisionCommitteeDto {
  @IsUUID()
  applicationId!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  quorum!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => DecisionCommitteeMemberInputDto)
  members!: DecisionCommitteeMemberInputDto[];
}

export class DecisionCommitteeMemberInputDto {
  @IsUUID()
  userId!: string;

  @IsEnum(DecisionCommitteeRole)
  role!: DecisionCommitteeRole;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class VoteDecisionCommitteeDto {
  @IsEnum(InterviewRecommendation)
  vote!: InterviewRecommendation;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  rationale!: string;

  @IsBoolean()
  conflictOfInterestDeclared!: boolean;

  @IsOptional()
  @IsBoolean()
  recuse?: boolean;
}

export class FinalizeDecisionCommitteeDto {
  @IsEnum(InterviewRecommendation)
  decision!: InterviewRecommendation;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  rationale!: string;
}
