import { ApplicationStatus } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class BulkUpdateApplicationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];

  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @IsOptional()
  @IsUUID()
  currentStageId?: string;

  @IsOptional()
  @IsUUID()
  assignedRecruiterId?: string;

  @IsOptional()
  @IsUUID()
  rejectionReasonId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
