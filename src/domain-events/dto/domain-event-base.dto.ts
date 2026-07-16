import { Type } from 'class-transformer';
import { IsDate, IsObject, IsOptional, IsUUID } from 'class-validator';

export class DomainEventBaseDto {
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
  @IsUUID()
  workflowId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  occurredAt?: Date;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
