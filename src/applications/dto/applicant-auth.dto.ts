import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ApplicantRegisterDto {
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  portalSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  invitationToken?: string;
}

export class ApplicantLoginDto {
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  portalSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  invitationToken?: string;
}
