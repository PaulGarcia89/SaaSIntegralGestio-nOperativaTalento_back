import { EmployeeStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Contract for registering an existing employee in the operational directory.
 * Candidate, offer, onboarding, payroll and identity data belong to their own domains.
 */
export class RegisterEmployeeDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(180)
  email!: string;

  @IsEnum(EmployeeStatus)
  status: EmployeeStatus = EmployeeStatus.ACTIVE;

  @IsUUID()
  primaryBranchId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  primaryRole!: string;
}
