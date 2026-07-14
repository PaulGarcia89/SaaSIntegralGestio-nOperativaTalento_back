import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ModuleCode } from '@prisma/client';

export class CreatePlatformModuleDto {
  @IsEnum(ModuleCode)
  code!: ModuleCode;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
