import { WorkflowSourceModule } from '@prisma/client';
import { IsEmail, IsEnum, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateHiringWorkflowDto {
  @IsOptional()
  @IsUUID()
  applicationId?: string;

  @IsOptional()
  @IsUUID()
  candidateId?: string;

  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  employeeName?: string;

  @IsOptional()
  @IsEmail()
  employeeEmail?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  jobTitle!: string;

  @IsOptional()
  @IsUUID()
  supervisorUserId?: string;

  @IsOptional()
  @IsEnum(WorkflowSourceModule)
  sourceModule?: WorkflowSourceModule;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
