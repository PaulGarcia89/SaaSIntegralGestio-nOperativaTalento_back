import { IsBoolean, IsEnum, IsObject, IsOptional } from 'class-validator';
import { ModuleCode } from '@prisma/client';

export class UpsertFeatureFlagDto {
  @IsEnum(ModuleCode)
  moduleCode!: ModuleCode;

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
