import { IsEmail, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

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
  @IsString()
  @MaxLength(5000000)
  resumeUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  coverLetter?: string;

  @IsOptional()
  @IsObject()
  dynamicResponses?: Record<string, unknown>;
}
