import { EmployeeStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsEmail()
  @MaxLength(180)
  email!: string;

  @IsEnum(EmployeeStatus)
  status: EmployeeStatus = EmployeeStatus.ACTIVE;

  @IsUUID()
  primaryBranchId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  primaryRole!: string;
}
