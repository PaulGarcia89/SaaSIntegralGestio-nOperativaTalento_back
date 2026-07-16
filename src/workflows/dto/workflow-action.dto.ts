import { Type } from 'class-transformer';
import { IsDate, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class WorkflowActionDto {
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  curriculumId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
