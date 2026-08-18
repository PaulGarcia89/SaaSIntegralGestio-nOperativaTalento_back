import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListProductivityEventsQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsIn(['DEMO', 'CV_SERVICE'])
  source?: 'DEMO' | 'CV_SERVICE';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 12;
}

export class CreateProductivityDemoEventDto {
  @IsUUID()
  cameraId!: string;

  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsString()
  @MaxLength(80)
  eventType!: string;

  @IsDateString()
  startedAt!: string;

  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsString()
  @MaxLength(160)
  idempotencyKey!: string;
}
