import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { WorkflowBlockerSeverity, WorkflowStageKey } from '@prisma/client';

export class UpdateWorkflowStageDto {
  @IsEnum(WorkflowStageKey)
  stepKey!: WorkflowStageKey;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerLabel?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  targetDate?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  blockerMessage?: string;

  @IsOptional()
  @IsEnum(WorkflowBlockerSeverity)
  blockerSeverity?: WorkflowBlockerSeverity;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
