import { IsUUID } from 'class-validator';

export class UpdateActiveTenantDto {
  @IsUUID()
  tenantId!: string;
}
