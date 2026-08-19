import { Type } from 'class-transformer';
import { ApplicationStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import {
  ApplicationInterviewDto,
  ApplicationTrackingDto,
} from './application-tracking.dto';

export class UpdateApplicationStatusDto {
  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @IsOptional()
  @IsUUID()
  currentStageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @IsOptional()
  @IsUUID()
  rejectionReasonId?: string;

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

  // Optimistic concurrency: clients submit the version they rendered.
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}

export class UndoApplicationTransitionDto {
  @IsDateString()
  expectedUpdatedAt!: string;
}

export class DecideApplicationTransitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
