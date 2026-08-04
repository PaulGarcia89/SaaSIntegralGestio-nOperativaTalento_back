import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ReportQueryDto } from './report-query.dto';

export class AtsAnalyticsQueryDto extends ReportQueryDto {
  @IsOptional()
  @IsUUID()
  vacancyId?: string;

  @IsOptional()
  @IsUUID()
  recruiterId?: string;

  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  granularity?: 'day' | 'week' | 'month';
}
