import { EmployeeStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateEmployeeStatusDto {
  @IsEnum(EmployeeStatus)
  status!: EmployeeStatus;
}
