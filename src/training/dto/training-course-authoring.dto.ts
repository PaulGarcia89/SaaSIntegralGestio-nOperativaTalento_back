import { PartialType } from '@nestjs/mapped-types';
import {
  TrainingContentBlockType,
  TrainingCourseStatus,
  TrainingDifficulty,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
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

export class ReorderTrainingEntityDto {
  @IsInt()
  @Transform(({ value }) => Number(value))
  @Min(0)
  sortOrder!: number;
}
