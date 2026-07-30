import {
  InterviewRecommendation,
  InterviewStatus,
  InterviewType,
  VacancyResponsibleRole,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
} from 'class-validator';

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
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class SubmitScorecardDto {
  @IsObject()
  criteria!: Record<string, unknown>;

  @IsInt()
  @Min(1)
  @Max(5)
  overallRating!: number;

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
}
