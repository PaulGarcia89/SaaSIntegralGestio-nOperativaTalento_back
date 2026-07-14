import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { VacancyApplicationFormSchemaDto } from './vacancy-form-schema.dto';

export class CreateVacancyFormTemplateDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roleTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @ValidateNested()
  @Type(() => VacancyApplicationFormSchemaDto)
  schema!: VacancyApplicationFormSchemaDto;
}
