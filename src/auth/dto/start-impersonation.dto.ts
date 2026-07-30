import { IsString, IsUUID, MinLength } from 'class-validator';

export class StartImpersonationDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MinLength(5)
  reason!: string;
}
