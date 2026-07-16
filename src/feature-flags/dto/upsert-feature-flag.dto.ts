import { IsBoolean, IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';
import { ModuleCode } from '@prisma/client';

export class UpsertFeatureFlagDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsEnum(ModuleCode)
  moduleCode!: ModuleCode;

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
