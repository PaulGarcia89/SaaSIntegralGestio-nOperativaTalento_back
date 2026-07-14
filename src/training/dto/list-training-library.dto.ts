import { TrainingResourceType } from '@prisma/client';
import { IsBooleanString, IsEnum, IsOptional, IsString, MaxLength, IsUUID } from 'class-validator';
import { OffsetPaginationQueryDto } from '../../common/dto/offset-pagination-query.dto';

export class ListTrainingLibraryDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(TrainingResourceType)
  resourceType?: TrainingResourceType;

  @IsOptional()
  @IsBooleanString()
  featured?: string;

  @IsOptional()
  @IsBooleanString()
  favoritesOnly?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  language?: string;

  @IsOptional()
  @IsString()
  sort?: string;
}
