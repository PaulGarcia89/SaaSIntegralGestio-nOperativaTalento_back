import { Transform } from 'class-transformer';
import { AutomationScope, AutomationTriggerEvent } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OffsetPaginationQueryDto } from '../../common/dto/offset-pagination-query.dto';

export class ListAutomationRulesDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsEnum(AutomationTriggerEvent)
  triggerEvent?: AutomationTriggerEvent;

  @IsOptional()
  @IsEnum(AutomationScope)
  scope?: AutomationScope;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
