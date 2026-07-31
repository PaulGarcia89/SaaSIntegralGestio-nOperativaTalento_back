import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateVacancyDto } from './create-vacancy.dto';

export class UpdateVacancyDto extends PartialType(
  OmitType(CreateVacancyDto, ['stages', 'responsibles'] as const),
) {}
