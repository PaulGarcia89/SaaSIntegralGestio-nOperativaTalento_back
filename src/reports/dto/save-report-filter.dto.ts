import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';

export class SaveReportFilterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsObject()
  filters!: Record<string, unknown>;
}
