import { BillingProvider } from '@prisma/client';
import { IsEmail, IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertBillingCustomerDto {
  @IsEnum(BillingProvider)
  provider!: BillingProvider;

  @IsString()
  @MaxLength(255)
  externalCustomerId!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
