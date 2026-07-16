import { AutomationExecutionStatus, AutomationTriggerEvent } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OffsetPaginationQueryDto } from '../../common/dto/offset-pagination-query.dto';

export class ListAutomationExecutionsDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsEnum(AutomationTriggerEvent)
  triggerEvent?: AutomationTriggerEvent;

  @IsOptional()
  @IsEnum(AutomationExecutionStatus)
  status?: AutomationExecutionStatus;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  workflowId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
