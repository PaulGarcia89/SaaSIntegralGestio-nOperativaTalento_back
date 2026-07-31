import {
  ApplicationStatus,
  CalendarProvider,
  DecisionCommitteeRole,
  InterviewRecommendation,
  InterviewStatus,
  InterviewType,
  ScorecardCriterionType,
  VideoConferenceProvider,
  VacancyResponsibleRole,
} from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
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

export class ListInterviewsDto {
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
}

export class ScheduleInterviewDto {
  @IsUUID()
  applicationId!: string;

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsUUID()
  interviewerUserId!: string;

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
  @IsUUID()
  vacancyId!: string;

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
