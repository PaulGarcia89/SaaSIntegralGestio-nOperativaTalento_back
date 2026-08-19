import { EmployeeStatus } from '@prisma/client';
import { IsArray, IsEnum, ArrayMinSize, IsUUID } from 'class-validator';

export class BulkUpdateEmployeeStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  employeeIds!: string[];

  @IsEnum(EmployeeStatus)
  status!: EmployeeStatus;
}
