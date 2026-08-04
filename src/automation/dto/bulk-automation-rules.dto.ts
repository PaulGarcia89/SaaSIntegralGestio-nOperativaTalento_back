import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsUUID } from 'class-validator';

export class BulkAutomationRulesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsIn(['ENABLE', 'DISABLE', 'DELETE'])
  action!: 'ENABLE' | 'DISABLE' | 'DELETE';
}
