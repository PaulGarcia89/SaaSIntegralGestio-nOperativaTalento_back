import { TrainingEventAttendanceStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class ListTrainingEventsDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(TrainingEventAttendanceStatus)
  status?: TrainingEventAttendanceStatus;
}
