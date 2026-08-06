import { RejectionReasonCategory } from '@prisma/client';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateApplicationSavedViewDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsObject()
  filters!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateApplicationSavedViewDto extends CreateApplicationSavedViewDto {}

export class CreateEmployeeReferralDto {
  @IsUUID() vacancyId!: string;
  @IsOptional() @IsString() @MaxLength(160) candidateEmail?: string;
  @IsOptional() @IsString() @MaxLength(160) candidateName?: string;
}

export class UpsertRejectionReasonDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MaxLength(60)
  code!: string;

  @IsString()
  @MaxLength(120)
  label!: string;

  @IsEnum(RejectionReasonCategory)
  category!: RejectionReasonCategory;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
