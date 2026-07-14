import { TrainingFavoriteEntityType } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

export class TrainingFavoriteDto {
  @IsEnum(TrainingFavoriteEntityType)
  entityType!: TrainingFavoriteEntityType;

  @IsUUID()
  entityId!: string;
}
