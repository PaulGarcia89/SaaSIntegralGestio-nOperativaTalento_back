import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class AssignEmployeeBranchDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  role!: string;
}
