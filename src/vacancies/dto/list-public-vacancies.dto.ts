import { VacancyEmploymentType, VacancyWorkMode } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OffsetPaginationQueryDto } from '../../common/dto/offset-pagination-query.dto';

export class ListPublicVacanciesDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @IsEnum(VacancyWorkMode)
  workMode?: VacancyWorkMode;

  @IsOptional()
  @IsEnum(VacancyEmploymentType)
  employmentType?: VacancyEmploymentType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;
}
