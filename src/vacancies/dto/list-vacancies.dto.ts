import { VacancyEmploymentType, VacancyStatus, VacancyWorkMode } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { OffsetPaginationQueryDto } from '../../common/dto/offset-pagination-query.dto';

export class ListVacanciesDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @IsEnum(VacancyStatus)
  status?: VacancyStatus;

  @IsOptional()
  @IsUUID()
  branchId?: string;

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
