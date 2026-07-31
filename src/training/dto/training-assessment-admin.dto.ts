import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayUnique,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  TrainingQuestionDifficulty,
  TrainingQuizFeedbackMode,
  TrainingQuizQuestionType,
} from '@prisma/client';

export class TrainingQuizOptionInputDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MaxLength(500)
  label!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

export class CreateTrainingQuizDto {
  @IsString()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  passingScore!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxAttempts?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(480)
  timeLimitMinutes?: number;

  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;

  @IsOptional() @IsBoolean() shuffleOptions?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(500) randomQuestionCount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10080) cooldownMinutes?: number;
  @IsOptional() @IsDateString() availableFrom?: string;
  @IsOptional() @IsDateString() availableUntil?: string;
  @IsOptional() @IsBoolean() requireAllQuestions?: boolean;
  @IsOptional() @IsEnum(TrainingQuizFeedbackMode) feedbackMode?: TrainingQuizFeedbackMode;
  @IsOptional() @IsObject() rubric?: Record<string, unknown>;
}

export class UpdateTrainingQuizDto extends PartialType(CreateTrainingQuizDto) {}

export class CreateTrainingQuizQuestionDto {
  @IsString()
  @MaxLength(2000)
  prompt!: string;

  @IsEnum(TrainingQuizQuestionType)
  questionType!: TrainingQuizQuestionType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  explanation?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  points!: number;

  @IsOptional()
  @IsBoolean()
  requiresManualGrading?: boolean;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TrainingQuizOptionInputDto)
  options!: TrainingQuizOptionInputDto[];

  @IsOptional() @IsString() @MaxLength(120) category?: string;
  @IsOptional() @IsEnum(TrainingQuestionDifficulty) difficulty?: TrainingQuestionDifficulty;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsString({ each: true }) @MaxLength(60, { each: true }) tags?: string[];
  @IsOptional() @IsObject() rubric?: Record<string, unknown>;
}

export class CreateTrainingQuestionBankItemDto extends CreateTrainingQuizQuestionDto {}
export class UpdateTrainingQuestionBankItemDto extends PartialType(CreateTrainingQuestionBankItemDto) {}

export class ImportTrainingQuestionBankItemsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  itemIds!: string[];
}

export class ListTrainingQuestionBankDto {
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsString() @MaxLength(120) category?: string;
  @IsOptional() @IsEnum(TrainingQuestionDifficulty) difficulty?: TrainingQuestionDifficulty;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class GradeTrainingAttemptAnswerDto {
  @IsUUID()
  answerId!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  awardedPoints!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback?: string;
}

export class GradeTrainingAttemptDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GradeTrainingAttemptAnswerDto)
  answers!: GradeTrainingAttemptAnswerDto[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  feedback?: string;
}

export class IssueTrainingCertificateDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  curriculumId?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class RevokeTrainingCertificateDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class UpdateTrainingCertificationPolicyDto {
  @IsBoolean() isEnabled!: boolean;
  @IsBoolean() autoIssue!: boolean;
  @IsBoolean() requireAssessment!: boolean;
  @IsBoolean() requireAllRequiredLessons!: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(3650) validityDays?: number;
  @IsInt() @Min(0) @Max(365) renewalWindowDays!: number;
  @IsArray() @ArrayMaxSize(10) @ArrayUnique() @IsInt({ each: true }) @Min(0, { each: true }) @Max(365, { each: true }) reminderDays!: number[];
  @IsOptional() @IsString() @MaxLength(180) certificateTitle?: string;
  @IsOptional() @IsString() @MaxLength(1000) certificateDescription?: string;
  @IsOptional() @IsString() @MaxLength(180) signatoryName?: string;
  @IsOptional() @IsString() @MaxLength(180) signatoryTitle?: string;
  @IsOptional() @IsUrl({ require_tld: false }) @MaxLength(2048) badgeImageUrl?: string;
}

export class RenewTrainingCertificateDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class ListTrainingAssessmentResultsDto {
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
