import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateTrainingQuizAttemptAnswerDto {
  @IsUUID()
  questionId!: string;

  @IsOptional()
  @IsUUID()
  optionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  textAnswer?: string;
}
