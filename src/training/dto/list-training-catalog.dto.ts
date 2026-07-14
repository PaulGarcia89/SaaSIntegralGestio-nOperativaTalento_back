import { TrainingCourseType, TrainingDifficulty } from '@prisma/client';
import { IsBooleanString, IsEnum, IsOptional, IsString, MaxLength, IsUUID } from 'class-validator';
import { OffsetPaginationQueryDto } from '../../common/dto/offset-pagination-query.dto';

export class ListTrainingCatalogDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(TrainingCourseType)
  type?: TrainingCourseType;

  @IsOptional()
  @IsEnum(TrainingDifficulty)
  difficulty?: TrainingDifficulty;

  @IsOptional()
  @IsBooleanString()
  assignedOnly?: string;

  @IsOptional()
  @IsBooleanString()
  favoritesOnly?: string;

  @IsOptional()
  @IsString()
  sort?: string;
}
