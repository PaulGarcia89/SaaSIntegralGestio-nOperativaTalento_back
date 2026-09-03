import { IsBoolean, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateEmailSettingsDto {
  @IsString() @IsNotEmpty() @MaxLength(253) smtpHost!: string;
  @IsInt() @Min(1) @Max(65535) smtpPort!: number;
  @IsBoolean() smtpSecure!: boolean;
  @IsString() @IsNotEmpty() @MaxLength(320) smtpUsername!: string;
  @IsOptional() @IsString() @MaxLength(500) smtpPassword?: string;
  @IsString() @IsNotEmpty() @MaxLength(120) fromName!: string;
  @IsEmail() fromEmail!: string;
  @IsBoolean() enabled!: boolean;
}

export class TestEmailSettingsDto {
  @IsEmail()
  recipient!: string;
}
