import { WorkflowSourceModule } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';

export class CreateOffboardingWorkflowDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(WorkflowSourceModule)
  sourceModule?: WorkflowSourceModule;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
