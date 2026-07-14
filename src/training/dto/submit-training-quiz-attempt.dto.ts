import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitTrainingQuizAttemptDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
