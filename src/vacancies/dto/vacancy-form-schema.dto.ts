import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export enum VacancyFormFieldTypeDto {
  TEXT = 'TEXT',
  TEXTAREA = 'TEXTAREA',
  NUMBER = 'NUMBER',
  SINGLE_SELECT = 'SINGLE_SELECT',
  MULTI_SELECT = 'MULTI_SELECT',
  BOOLEAN = 'BOOLEAN',
  URL = 'URL',
}

export class VacancyFormFieldDto {
  @IsString()
  @MaxLength(80)
  key!: string;

  @IsString()
  @MaxLength(120)
  label!: string;

  @IsEnum(VacancyFormFieldTypeDto)
  type!: VacancyFormFieldTypeDto;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  placeholder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  helperText?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  options?: string[];

  @IsBoolean()
  required!: boolean;
}

export class VacancyFormSectionDto {
  @IsString()
  @MaxLength(80)
  id!: string;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => VacancyFormFieldDto)
  fields!: VacancyFormFieldDto[];
}

export class VacancyApplicationFormSchemaDto {
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => VacancyFormSectionDto)
  sections!: VacancyFormSectionDto[];
}
