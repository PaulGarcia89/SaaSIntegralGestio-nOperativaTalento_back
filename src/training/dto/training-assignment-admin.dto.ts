import { TrainingProgressStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { OffsetPaginationQueryDto } from '../../common/dto/offset-pagination-query.dto';

export enum TrainingAssignmentAudience {
  USERS = 'USERS',
  ROLES = 'ROLES',
  BRANCHES = 'BRANCHES',
  TENANT = 'TENANT',
}

export class CreateTrainingAssignmentsDto {
  @IsUUID()
  courseId!: string;

  @IsEnum(TrainingAssignmentAudience)
  audience!: TrainingAssignmentAudience;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  targetIds?: string[];

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

export class ListTrainingAdminAssignmentsDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsEnum(TrainingProgressStatus)
  status?: TrainingProgressStatus;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  overdue?: boolean;
}

export class UpdateTrainingLessonProgressDto {
  @IsBoolean()
  completed!: boolean;
}
