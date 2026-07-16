import { WorkflowTaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateWorkflowStepStatusDto {
  @IsEnum(WorkflowTaskStatus)
  status!: WorkflowTaskStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @IsOptional()
  @IsString()
  blockingReason?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  completedAt?: Date;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
