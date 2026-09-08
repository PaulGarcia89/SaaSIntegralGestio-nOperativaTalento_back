import { IsOptional, IsUUID } from 'class-validator';

export class EmployeesSummaryQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
