import { TalentActivityType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OffsetPaginationQueryDto } from '../../common/dto/offset-pagination-query.dto';

export class ListTalentCandidatesDto extends OffsetPaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @IsOptional() @IsUUID() poolId?: string;
  @IsOptional() @IsUUID() tagId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() doNotContact?: boolean;
}

export class ListDuplicateCandidatesDto {
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(30) @Max(100) minimumScore?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class CreateTalentPoolDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsUUID() branchId?: string;
}

export class UpdateTalentPoolDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateTalentTagDto {
  @IsString() @MinLength(2) @MaxLength(50) name!: string;
  @IsOptional() @IsHexColor() color?: string;
}

export class CandidateRelationDto {
  @IsUUID() candidateId!: string;
}

export class TagCandidateDto {
  @IsUUID() tagId!: string;
}

export class CreateTalentActivityDto {
  @IsEnum(TalentActivityType) type!: TalentActivityType;
  @IsString() @MinLength(2) @MaxLength(120) subject!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsBoolean() completed?: boolean;
}

export class UpdateTalentCandidateDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) fullName?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(500) linkedinUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) portfolioUrl?: string;
  @IsOptional() @IsString() @MaxLength(80) source?: string;
  @IsOptional() @IsBoolean() doNotContact?: boolean;
}

export class MergeCandidatesDto {
  @IsUUID() sourceCandidateId!: string;
  @IsUUID() targetCandidateId!: string;
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

export class TalentSegmentFiltersDto {
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @IsOptional() @IsUUID() poolId?: string;
  @IsOptional() @IsUUID() tagId?: string;
  @IsOptional() @IsString() @MaxLength(80) competency?: string;
  @IsOptional() @IsString() @MaxLength(80) source?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsBoolean() doNotContact?: boolean;
}

export class CreateTalentSegmentDto {
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ValidateNested() @Type(() => TalentSegmentFiltersDto) filters!: TalentSegmentFiltersDto;
}

export class CreateTalentCampaignDto {
  @IsUUID() segmentId!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MinLength(2) @MaxLength(180) subject!: string;
  @IsString() @MinLength(2) @MaxLength(12000) body!: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
}

export class ListTalentCampaignAudienceDto extends OffsetPaginationQueryDto {}

export class ReviewTalentCampaignAudienceDto {
  @Transform(({ value }) => value === true || value === 'true') @IsBoolean() confirm!: boolean;
  @IsString() @MinLength(8) @MaxLength(128) audienceFingerprint!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ApproveTalentCampaignDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CreateTalentSequenceStepDto {
  @IsInt() @Min(0) @Max(720) delayHours!: number;
  @IsString() @MinLength(2) @MaxLength(180) subject!: string;
  @IsString() @MinLength(2) @MaxLength(12000) body!: string;
}

export class CreateTalentSequenceDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsUUID() segmentId?: string;
  @IsInt() @Min(1) @Max(12) stepCount!: number;
  @ValidateNested({ each: true }) @Type(() => CreateTalentSequenceStepDto) steps!: CreateTalentSequenceStepDto[];
}

export class EnrollTalentSequenceDto {
  @IsOptional() @IsUUID() segmentId?: string;
  @IsOptional() @IsUUID() candidateId?: string;
}
