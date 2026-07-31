import { TrainingLaunchAudience, TrainingLaunchStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
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
} from 'class-validator';
import { OffsetPaginationQueryDto } from '../../common/dto/offset-pagination-query.dto';

export class CreateTrainingLaunchDto {
  @IsUUID()
  courseId!: string;

  @IsString()
  @MaxLength(140)
  name!: string;

  @IsEnum(TrainingLaunchAudience)
  audience!: TrainingLaunchAudience;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  targetIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  batchSize?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  rolloutIntervalHours?: number;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class UpdateTrainingLaunchStatusDto {
  @IsEnum(TrainingLaunchStatus)
  status!: TrainingLaunchStatus;
}

export class ListTrainingLaunchesDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsEnum(TrainingLaunchStatus)
  status?: TrainingLaunchStatus;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MaxLength(160)
  search?: string;
}
