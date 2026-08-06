import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
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

export class UpsertRecruitmentSourceCostDto {
  @IsString() @MaxLength(100) source!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(999999999) amountCents!: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpsertHiringQualityReviewDto {
  @IsUUID() employeeId!: string;
  @Type(() => Number) @IsInt() @IsIn([30, 60, 90]) checkpointDays!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) performanceScore!: number;
  @IsBoolean() retained!: boolean;
  @IsOptional() @IsString() @MaxLength(2000) managerComment?: string;
}
