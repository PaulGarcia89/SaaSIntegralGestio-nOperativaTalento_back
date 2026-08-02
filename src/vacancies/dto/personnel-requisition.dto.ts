import { PersonnelRequisitionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePersonnelRequisitionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  justification!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  openings!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  budgetMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  budgetMax?: number;

  @IsString()
  @MaxLength(8)
  currency!: string;

  @IsOptional()
  @IsDateString()
  targetStartDate?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  branchIds!: string[];

  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  approverUserIds!: string[];

  @IsOptional()
  @IsEnum(PersonnelRequisitionStatus)
  status?: PersonnelRequisitionStatus;
}

export class DecidePersonnelRequisitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class VacancyActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
