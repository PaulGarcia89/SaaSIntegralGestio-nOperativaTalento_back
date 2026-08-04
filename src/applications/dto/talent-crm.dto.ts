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
} from 'class-validator';
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
