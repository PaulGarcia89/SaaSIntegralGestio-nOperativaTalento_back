import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class AutomationConditionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  field?: string;

  @IsOptional()
  @IsIn(['equals', 'not_equals', 'in', 'not_in', 'exists'])
  operator?: 'equals' | 'not_equals' | 'in' | 'not_in' | 'exists';

  @IsOptional()
  value?: string | number | boolean | null;

  @IsOptional()
  @IsArray()
  values?: Array<string | number | boolean>;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
