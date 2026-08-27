import {
  ApplicationStatus,
  VacancyEmploymentType,
  VacancyResponsibleRole,
  VacancyStatus,
  VacancyWorkMode,
} from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
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

export class CreateVacancyStageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  position!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsEnum(ApplicationStatus)
  applicationStatus?: ApplicationStatus;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  allowedNextStageCodes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  requiredFields?: string[];

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  requiredApprovals?: number;

  @IsOptional()
  @IsBoolean()
  allowReopen?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  slaHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8760)
  slaWarningHoursBefore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8760)
  slaEscalationHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  autoReassignAfterHours?: number;

  @IsOptional()
  @IsBoolean()
  isTerminal?: boolean;
}

export class CreateVacancyResponsibleDto {
  @IsUUID()
  userId!: string;

  @IsEnum(VacancyResponsibleRole)
  role!: VacancyResponsibleRole;
}

export class CreateVacancyDto {
  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  locationBranchIds?: string[];

  @IsOptional()
  @IsUUID()
  requisitionId?: string;

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
  @IsObject()
  translations?: Record<string, Record<string, string>>;

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateVacancyStageDto)
  stages?: CreateVacancyStageDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateVacancyResponsibleDto)
  responsibles?: CreateVacancyResponsibleDto[];
}
