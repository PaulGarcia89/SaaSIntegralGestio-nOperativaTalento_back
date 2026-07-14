import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class TransferEmployeeDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  role!: string;
}
