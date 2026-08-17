import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateEmployeeDto } from './create-employee.dto';

export class BulkCreateEmployeesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateEmployeeDto)
  employees!: CreateEmployeeDto[];
}
