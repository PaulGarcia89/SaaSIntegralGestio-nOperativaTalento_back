import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PlanCode } from '@prisma/client';

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
}
