import { WorkflowSourceModule } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateBranchTransferWorkflowDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  targetBranchId!: string;

  @IsString()
  @MinLength(2)
  role!: string;

  @IsOptional()
  @IsEnum(WorkflowSourceModule)
  sourceModule?: WorkflowSourceModule;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
