import { WorkflowSourceModule } from '@prisma/client';
import { IsEmail, IsEnum, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

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

  @IsOptional()
  @IsEnum(WorkflowSourceModule)
  sourceModule?: WorkflowSourceModule;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
