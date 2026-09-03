import { PartialType } from '@nestjs/mapped-types';
import {
  TrainingAudienceOperator,
  TrainingAudienceRuleType,
  TrainingCompetencyLevel,
  TrainingContentBlockType,
  TrainingCourseStatus,
  TrainingDifficulty,
  TrainingPilotStatus,
  TrainingQualityReviewStatus,
  TrainingQualityReviewType,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  ArrayUnique,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
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
import { OffsetPaginationQueryDto } from '../../common/dto/offset-pagination-query.dto';

export enum TrainingCourseScope {
  TENANT = 'TENANT',
  GLOBAL = 'GLOBAL',
}

export class CreateTrainingContentBlockDto {
  @IsEnum(TrainingContentBlockType)
  type!: TrainingContentBlockType;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  resourceUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class CreateTrainingLessonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  estimatedMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  requiredCompletionPercentage?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTrainingContentBlockDto)
  blocks?: CreateTrainingContentBlockDto[];
}

export class CreateTrainingCourseModuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTrainingLessonDto)
  lessons?: CreateTrainingLessonDto[];
}

export class CreateTrainingCourseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  coverImageUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  introVideoUrl?: string;

  @IsOptional()
  @IsEnum(TrainingDifficulty)
  difficulty?: TrainingDifficulty;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  estimatedMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(TrainingCourseScope)
  scope?: TrainingCourseScope;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTrainingCourseModuleDto)
  modules?: CreateTrainingCourseModuleDto[];
}

export class UpdateTrainingCourseDto extends PartialType(CreateTrainingCourseDto) {}

export class UpdateTrainingCourseModuleDto extends PartialType(CreateTrainingCourseModuleDto) {}

export class UpdateTrainingLessonDto extends PartialType(CreateTrainingLessonDto) {}

export class UpdateTrainingContentBlockDto extends PartialType(CreateTrainingContentBlockDto) {}

export class ListTrainingAdminCoursesDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  search?: string;

  @IsOptional()
  @IsEnum(TrainingCourseStatus)
  status?: TrainingCourseStatus;

  @IsOptional()
  @IsEnum(TrainingCourseScope)
  scope?: TrainingCourseScope;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class TrainingCourseTransitionOptionsDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledPublishAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledRetireAt?: Date;
}

export class TransitionTrainingCourseDto extends TrainingCourseTransitionOptionsDto {
  @IsEnum(TrainingCourseStatus)
  status!: TrainingCourseStatus;
}

export class DuplicateTrainingCourseDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;
}

export class CreateTrainingCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUUID()
  parentCategoryId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(TrainingCourseScope)
  scope?: TrainingCourseScope;
}

export class UpdateTrainingCategoryDto extends PartialType(CreateTrainingCategoryDto) {}

export class CreateTrainingCompetencyDto {
  @IsString() @IsNotEmpty() @MaxLength(80) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(180) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(180) framework?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsEnum(TrainingCourseScope) scope?: TrainingCourseScope;
}

export class UpdateTrainingCompetencyDto extends PartialType(CreateTrainingCompetencyDto) {}

export class TrainingCourseBriefDto {
  @IsString() @MaxLength(4000) businessNeed!: string;
  @IsString() @MaxLength(4000) targetOutcome!: string;
  @IsString() @MaxLength(1000) successKpi!: string;
  @IsOptional() @IsString() @MaxLength(2000) audienceDescription?: string;
  @IsOptional() @IsString() @MaxLength(500) baselineMetric?: string;
  @IsOptional() @IsString() @MaxLength(500) targetMetric?: string;
  @IsOptional() @IsString() @MaxLength(2000) riskIfNotCompleted?: string;
  @IsOptional() @IsUUID() contentOwnerId?: string;
  @IsOptional() @IsUUID() subjectMatterExpertId?: string;
  @IsOptional() @Type(() => Date) @IsDate() targetDate?: Date;
}

export class TrainingCourseCompetencyInputDto {
  @IsUUID() competencyId!: string;
  @IsOptional() @IsEnum(TrainingCompetencyLevel) targetLevel?: TrainingCompetencyLevel;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class TrainingLearningObjectiveInputDto {
  @IsOptional() @IsUUID() competencyId?: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) statement!: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) successCriteria!: string;
  @IsString() @IsNotEmpty() @MaxLength(500) assessmentMethod!: string;
  @IsOptional() @IsEnum(TrainingCompetencyLevel) targetLevel?: TrainingCompetencyLevel;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class TrainingAudienceRuleInputDto {
  @IsEnum(TrainingAudienceRuleType) ruleType!: TrainingAudienceRuleType;
  @IsOptional() @IsEnum(TrainingAudienceOperator) operator?: TrainingAudienceOperator;
  @IsString() @IsNotEmpty() @MaxLength(500) value!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateTrainingCourseDesignDto {
  @ValidateNested() @Type(() => TrainingCourseBriefDto) brief!: TrainingCourseBriefDto;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TrainingCourseCompetencyInputDto)
  competencies!: TrainingCourseCompetencyInputDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => TrainingLearningObjectiveInputDto)
  objectives!: TrainingLearningObjectiveInputDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => TrainingAudienceRuleInputDto)
  audienceRules!: TrainingAudienceRuleInputDto[];
}

export class ReorderTrainingEntityDto {
  @IsInt()
  @Transform(({ value }) => Number(value))
  @Min(0)
  sortOrder!: number;
}

export class ReorderTrainingEntitiesDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  entityIds!: string[];
}

export class RequestTrainingQualityReviewsDto {
  @IsArray()
  @ArrayUnique()
  @IsEnum(TrainingQualityReviewType, { each: true })
  reviewTypes!: TrainingQualityReviewType[];

  @IsOptional() @IsUUID() reviewerId?: string;
}

export class DecideTrainingQualityReviewDto {
  @IsEnum(TrainingQualityReviewStatus) status!: TrainingQualityReviewStatus;
  @IsObject() checklist!: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(2000) summary?: string;
}

export class CreateTrainingCoursePilotDto {
  @IsString() @IsNotEmpty() @MaxLength(180) name!: string;
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) participantIds!: string[];
  @IsObject() successCriteria!: Record<string, unknown>;
  @IsOptional() @IsDate() @Type(() => Date) startsAt?: Date;
  @IsOptional() @IsDate() @Type(() => Date) endsAt?: Date;
}

export class UpdateTrainingCoursePilotStatusDto {
  @IsEnum(TrainingPilotStatus) status!: TrainingPilotStatus;
}

export class SubmitTrainingPilotFeedbackDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsInt() @Min(1) @Max(5) clarityRating!: number;
  @IsInt() @Min(1) @Max(5) relevanceRating!: number;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
  @IsOptional() @IsBoolean() blockingIssue?: boolean;
}
