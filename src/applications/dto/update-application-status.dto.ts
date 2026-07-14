import { Type } from 'class-transformer';
import { ApplicationStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import {
  ApplicationInterviewDto,
  ApplicationTrackingDto,
} from './application-tracking.dto';

export class UpdateApplicationStatusDto {
  @IsEnum(ApplicationStatus)
  status!: ApplicationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ApplicationInterviewDto)
  interview?: ApplicationInterviewDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ApplicationTrackingDto)
  tracking?: ApplicationTrackingDto | null;
}
