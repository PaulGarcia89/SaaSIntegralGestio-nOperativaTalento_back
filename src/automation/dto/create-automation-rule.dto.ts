import { Type } from 'class-transformer';
import { AutomationScope, AutomationTriggerEvent } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { AutomationConditionDto } from './automation-condition.dto';
import { AutomationConsequenceDto } from './automation-consequence.dto';

export class CreateAutomationRuleDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsEnum(AutomationTriggerEvent)
  triggerEvent!: AutomationTriggerEvent;

  @IsEnum(AutomationScope)
  scope!: AutomationScope;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  version?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomationConditionDto)
  conditions?: AutomationConditionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomationConsequenceDto)
  consequences!: AutomationConsequenceDto[];
}
