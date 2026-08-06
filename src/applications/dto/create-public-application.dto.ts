import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePublicApplicationDto {
  @IsString()
  @MaxLength(160)
  fullName!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  linkedinUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  portfolioUrl?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  resumeConsent?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  resumeConsentVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  coverLetter?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
  })
  @IsObject()
  dynamicResponses?: Record<string, unknown>;

  @IsOptional() @IsString() @MaxLength(80) source?: string;
  @IsOptional() @IsString() @MaxLength(120) referralCode?: string;
  @IsOptional() @IsString() @MaxLength(160) utmSource?: string;
  @IsOptional() @IsString() @MaxLength(160) utmMedium?: string;
  @IsOptional() @IsString() @MaxLength(160) utmCampaign?: string;
}
