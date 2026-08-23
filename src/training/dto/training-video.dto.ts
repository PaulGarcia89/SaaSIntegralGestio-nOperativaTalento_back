import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTrainingVideoDto {
  @IsOptional()
  @IsUUID()
  lessonId?: string;

  @IsString()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  videoUrl?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86_400)
  durationSeconds!: number;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  thumbnailUrl?: string;

  @IsOptional()
  @IsUUID()
  moduleId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isMandatory?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  requiredCompletionPercentage?: number;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  allowReplay?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}

export class StartTrainingVideoDto {
  @IsUUID()
  assignmentId!: string;

  @IsUUID()
  lessonId!: string;

  @IsUUID()
  playbackSessionId!: string;
}

export class TrainingVideoHeartbeatDto extends StartTrainingVideoDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  currentTimeSeconds!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86_400)
  durationSeconds!: number;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isPlaying!: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(2)
  playbackRate?: number;

  @IsDateString()
  clientTimestamp!: string;
}

export class TrainingVideoEventDto extends StartTrainingVideoDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  currentTimeSeconds!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86_400)
  durationSeconds!: number;
}
