import {
  CompensationPeriodicity,
  JobOfferApprovalType,
} from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateJobOfferDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  salaryAmount!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsEnum(CompensationPeriodicity)
  periodicity!: CompensationPeriodicity;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  benefits?: string[];

  @IsString()
  @MaxLength(160)
  jobTitle!: string;

  @IsDateString()
  employmentStartDate!: string;

  @IsDateString()
  validUntil!: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  message?: string;

  @IsOptional()
  @IsUUID()
  financialApproverId?: string;

  @IsOptional()
  @IsUUID()
  managerialApproverId?: string;
}

export class DecideJobOfferApprovalDto {
  @IsEnum(JobOfferApprovalType)
  type!: JobOfferApprovalType;

  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CounterJobOfferDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  salaryAmount?: number;

  @IsOptional()
  @IsEnum(CompensationPeriodicity)
  periodicity?: CompensationPeriodicity;

  @IsOptional()
  @IsDateString()
  employmentStartDate?: string;

  @IsString()
  @MaxLength(4000)
  reason!: string;
}

export enum CandidateOfferDecision {
  ACCEPT = 'ACCEPT',
  REJECT = 'REJECT',
}

export class RespondJobOfferDto {
  @IsEnum(CandidateOfferDecision)
  decision!: CandidateOfferDecision;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  typedName?: string;

  @IsOptional()
  @IsBoolean()
  consentAccepted?: boolean;
}
