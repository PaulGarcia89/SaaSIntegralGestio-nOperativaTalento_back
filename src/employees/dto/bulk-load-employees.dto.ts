import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { RegisterEmployeeDto } from './register-employee.dto';

export class BulkLoadEmployeesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RegisterEmployeeDto)
  employees!: RegisterEmployeeDto[];
}
