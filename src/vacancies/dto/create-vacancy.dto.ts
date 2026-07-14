import { VacancyEmploymentType, VacancyStatus, VacancyWorkMode } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VacancyApplicationFormSchemaDto } from './vacancy-form-schema.dto';

export class CreateVacancyDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  requirements?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  responsibilities?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  benefits?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  seniority?: string;

  @IsOptional()
  @IsEnum(VacancyWorkMode)
  workMode?: VacancyWorkMode;

  @IsOptional()
  @IsEnum(VacancyEmploymentType)
  employmentType?: VacancyEmploymentType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  openings?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMax?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000000)
  imageUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => VacancyApplicationFormSchemaDto)
  applicationFormSchema?: VacancyApplicationFormSchemaDto;

  @IsOptional()
  @IsEnum(VacancyStatus)
  status?: VacancyStatus;
}
