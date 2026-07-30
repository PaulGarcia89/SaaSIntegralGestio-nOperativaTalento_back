import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { PlanCode } from '@prisma/client';

export class PlanLimitsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsers?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxBranches?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxActiveVacancies?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxCourses?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAssets?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  storageGb?: number | null;
}

export class CreatePlanDto {
  @IsEnum(PlanCode)
  code!: PlanCode;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceMonthly?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceYearly?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  moduleIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PlanLimitsDto)
  limits?: PlanLimitsDto;
}
