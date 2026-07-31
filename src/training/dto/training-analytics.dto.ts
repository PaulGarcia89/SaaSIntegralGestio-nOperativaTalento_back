import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsEnum,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  TrainingImprovementPriority,
  TrainingImprovementSource,
  TrainingImprovementStatus,
} from '@prisma/client';

export class TrainingAnalyticsQueryDto {
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class UpsertTrainingCompliancePolicyDto {
  @IsUUID()
  courseId!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  dueDays!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  renewalDays?: number;

  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  reminderDays!: number[];
}

export class ListTrainingImprovementsDto {
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsEnum(TrainingImprovementStatus)
  status?: TrainingImprovementStatus;
}

export class CreateTrainingImprovementDto {
  @IsUUID()
  courseId!: string;

  @IsString()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsEnum(TrainingImprovementPriority)
  priority?: TrainingImprovementPriority;

  @IsOptional()
  @IsEnum(TrainingImprovementSource)
  source?: TrainingImprovementSource;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  signalCode?: string;

  @IsOptional()
  evidence?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class UpdateTrainingImprovementDto {
  @IsOptional()
  @IsEnum(TrainingImprovementStatus)
  status?: TrainingImprovementStatus;

  @IsOptional()
  @IsEnum(TrainingImprovementPriority)
  priority?: TrainingImprovementPriority;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  outcomeNotes?: string;
}
