import {
  TrainingAssignmentType,
  TrainingProgressStatus,
} from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OffsetPaginationQueryDto } from '../../common/dto/offset-pagination-query.dto';

export class ListTrainingAssignmentsDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsEnum(TrainingProgressStatus)
  status?: TrainingProgressStatus;

  @IsOptional()
  @IsEnum(TrainingAssignmentType)
  type?: TrainingAssignmentType;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @IsIn(['date', 'progress', 'title'])
  sort?: 'date' | 'progress' | 'title';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
