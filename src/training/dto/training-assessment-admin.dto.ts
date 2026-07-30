import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TrainingQuizQuestionType } from '@prisma/client';

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
}

export class UpdateTrainingQuizDto extends CreateTrainingQuizDto {}

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
