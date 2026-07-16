import { Transform } from 'class-transformer';
import { WorkflowMasterSlaStatus, WorkflowStatus, WorkflowType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OffsetPaginationQueryDto } from '../../common/dto/offset-pagination-query.dto';

export class ListWorkflowMasterDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  candidateId?: string;

  @IsOptional()
  @IsEnum(WorkflowType)
  workflowType?: WorkflowType;

  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @IsOptional()
  @IsEnum(WorkflowMasterSlaStatus)
  slaStatus?: WorkflowMasterSlaStatus;

  @IsOptional()
  @Transform(({ value }) => (value ? String(value) : undefined))
  currentStage?: string;
}
