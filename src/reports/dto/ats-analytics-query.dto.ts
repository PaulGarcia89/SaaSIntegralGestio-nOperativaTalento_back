import { IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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

export class SaveAtsAnalyticsDashboardDto extends AtsAnalyticsQueryDto {
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsArray() widgets?: string[];
  @IsOptional() isDefault?: boolean;
}
