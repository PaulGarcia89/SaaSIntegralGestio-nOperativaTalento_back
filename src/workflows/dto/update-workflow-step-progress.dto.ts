import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateWorkflowStepProgressDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent!: number;
}
