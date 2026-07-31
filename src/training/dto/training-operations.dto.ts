import { TrainingOperationKind } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ExecuteTrainingOperationDto {
  @IsEnum(TrainingOperationKind)
  kind!: TrainingOperationKind;
}
