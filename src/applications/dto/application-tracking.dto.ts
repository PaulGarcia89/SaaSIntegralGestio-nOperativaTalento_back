import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum InterviewType {
  PRESENTIAL = 'PRESENTIAL',
  VIRTUAL = 'VIRTUAL',
  PHONE = 'PHONE',
}

export enum ApplicationTimelineEventType {
  VACANCY_PUBLISHED = 'VACANCY_PUBLISHED',
  APPLIED = 'APPLIED',
  CONTACTED = 'CONTACTED',
  INTERVIEW_SCHEDULED = 'INTERVIEW_SCHEDULED',
  INTERVIEW_COMPLETED = 'INTERVIEW_COMPLETED',
}

export class ApplicationInterviewDto {
  @IsEnum(InterviewType)
  type!: InterviewType;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;

  @IsOptional()
  @IsDateString()
  followUpAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observations?: string | null;
}

export class ApplicationTimelineEventDto {
  @IsEnum(ApplicationTimelineEventType)
  type!: ApplicationTimelineEventType;

  @IsOptional()
  @IsDateString()
  at?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string | null;
}

export class ApplicationTrackingDto {
  @IsOptional()
  @IsDateString()
  contactedAt?: string | null;

  @IsOptional()
  @IsDateString()
  interviewCompletedAt?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApplicationTimelineEventDto)
  timelineEvents?: ApplicationTimelineEventDto[] | null;
}
