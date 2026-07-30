import { ApplicationStatus } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsString } from 'class-validator';

export class BulkUpdateApplicationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];

  @IsEnum(ApplicationStatus)
  status!: ApplicationStatus;
}
