import { IsUUID } from 'class-validator';

export class UpdateActiveBranchDto {
  @IsUUID()
  branchId!: string;
}
