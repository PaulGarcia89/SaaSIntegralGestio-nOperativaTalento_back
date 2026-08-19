import { EmployeeStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class EmployeePersonalDto {
  @IsString() @IsNotEmpty() @MaxLength(80) legalFirstName!: string;
  @IsOptional() @IsString() @MaxLength(80) middleName?: string;
  @IsString() @IsNotEmpty() @MaxLength(80) legalLastName!: string;
  @IsOptional() @IsString() @MaxLength(80) preferredName?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
}

export class EmployeeContactDto {
  @IsOptional() @IsEmail() personalEmail?: string;
  @IsOptional() @IsEmail() workEmail?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(180) addressLine1?: string;
  @IsOptional() @IsString() @MaxLength(180) addressLine2?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(50) state?: string;
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;
  @IsOptional() @IsString() @MaxLength(50) country?: string;
}

export class EmployeeEmergencyContactDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(80) relationship?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
}

export class EmployeeEmploymentDto {
  @IsUUID() primaryBranchId!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) jobTitle!: string;
  @IsOptional() @IsString() @MaxLength(120) department?: string;
  @IsOptional() @IsString() @MaxLength(120) positionId?: string;
  @IsOptional() @IsUUID() supervisorUserId?: string;
  @IsOptional() @IsDateString() hireDate?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsString() @MaxLength(80) workerClassification?: string;
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
}

export class EmployeePayrollDto {
  @IsOptional() @IsString() @MaxLength(40) payType?: string;
  @IsOptional() @IsString() @MaxLength(64) payRate?: string;
  @IsOptional() @IsString() @MaxLength(32) payFrequency?: string;
  @IsOptional() @IsBoolean() overtimeEligible?: boolean;
  @IsOptional() @IsString() @MaxLength(64) regularHourlyRate?: string;
  @IsOptional() @IsString() @MaxLength(16) workweekStartDay?: string;
  @IsOptional() @IsString() @MaxLength(16) workweekStartTime?: string;
  @IsOptional() @IsString() @MaxLength(32) paymentMethod?: string;
  @IsOptional() @IsString() @MaxLength(80) payrollProvider?: string;
  @IsOptional() @IsString() @MaxLength(80) payrollEmployeeId?: string;
  @IsOptional() @IsString() @MaxLength(120) externalPayrollReference?: string;
}

export class EmployeeTaxDto {
  @IsOptional() @IsString() @MaxLength(32) ssn?: string;
  @IsOptional() @IsString() @MaxLength(4) ssnLast4?: string;
  @IsOptional() @IsString() @MaxLength(32) w4Status?: string;
  @IsOptional() @IsString() @MaxLength(120) w2Reference?: string;
}

export class EmployeeWorkEligibilityDto {
  @IsOptional() @IsString() @MaxLength(32) i9Status?: string;
  @IsOptional() @IsDateString() firstDayOfEmployment?: string;
  @IsOptional() @IsBoolean() reverificationRequired?: boolean;
  @IsOptional() @IsString() @MaxLength(32) eVerifyStatus?: string;
  @IsOptional() @IsBoolean() eVerifyRequired?: boolean;
}

export class EmployeeFloridaNewHireDto {
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsString() @MaxLength(32) status?: string;
  @IsOptional() @IsDateString() dueDate?: string;
}

export class RegisterEmployeeDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => EmployeePersonalDto)
  personal?: EmployeePersonalDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmployeeContactDto)
  contact?: EmployeeContactDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmployeeEmploymentDto)
  employment?: EmployeeEmploymentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmployeePayrollDto)
  payroll?: EmployeePayrollDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmployeeTaxDto)
  tax?: EmployeeTaxDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmployeeWorkEligibilityDto)
  eligibility?: EmployeeWorkEligibilityDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmployeeFloridaNewHireDto)
  floridaNewHire?: EmployeeFloridaNewHireDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmployeeEmergencyContactDto)
  emergencyContact?: EmployeeEmergencyContactDto;

  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsEmail() @MaxLength(180) email?: string;
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
  @IsOptional() @IsUUID() primaryBranchId?: string;
  @IsOptional() @IsString() @MaxLength(120) primaryRole?: string;
}
