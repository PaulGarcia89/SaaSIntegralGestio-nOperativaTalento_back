import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateTrainingStepProgressDto {
  @Type(() => Boolean)
  @IsBoolean()
  isCompleted!: boolean;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  score?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  timeSpentSeconds?: number;
}
