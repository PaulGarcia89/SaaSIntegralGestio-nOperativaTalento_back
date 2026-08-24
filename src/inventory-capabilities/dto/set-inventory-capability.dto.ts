import { IsBoolean, IsOptional } from 'class-validator';
import { Prisma } from '@prisma/client';

export class SetInventoryCapabilityDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  metadata?: Prisma.InputJsonValue;
}
