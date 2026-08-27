import { IsBoolean, IsEmail, IsIn, IsObject, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CandidateRegisterDto {
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;
}

export class CandidateLoginDto extends CandidateRegisterDto {}

export class CandidateForgotPasswordDto {
  @IsEmail()
  @MaxLength(160)
  email!: string;
}

export class CandidateResetPasswordDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;
}

export class CandidateSocialExchangeDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;
}

export class CandidateProfileDto {
  @IsOptional() @IsString() @MaxLength(160) fullName?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsUrl() @MaxLength(255) linkedinUrl?: string;
  @IsOptional() @IsUrl() @MaxLength(255) portfolioUrl?: string;
  @IsOptional() @IsIn(['es', 'en']) locale?: string;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @IsBoolean() statusUpdates?: boolean;
  @IsOptional() @IsBoolean() interviewReminders?: boolean;
  @IsOptional() @IsBoolean() offerNotifications?: boolean;
  @IsOptional() @IsBoolean() marketingConsent?: boolean;
  @IsOptional() @IsObject() applicationProfile?: Record<string, unknown>;
  // Temporary format relaxation for environments without a real SSN.
  @IsOptional() @IsString() @MaxLength(64) socialSecurityNumber?: string;
}
