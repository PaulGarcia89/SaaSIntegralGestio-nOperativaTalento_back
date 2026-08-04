import { IsObject, IsOptional, IsUUID } from 'class-validator';

export class SimulateAutomationRuleDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  workflowId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  candidateId?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
