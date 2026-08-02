import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfigureCommunicationDomainDto {
  @IsString() @IsNotEmpty() @MaxLength(253) domain!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) fromName!: string;
  @IsEmail() fromEmail!: string;
  @IsOptional() @IsEmail() replyToEmail?: string;
  @IsOptional() @IsString() @MaxLength(63) dkimSelector?: string;
}

export class ReplyCandidateEmailDto {
  @IsString() @IsNotEmpty() @MaxLength(240) subject!: string;
  @IsString() @IsNotEmpty() @MaxLength(12000) body!: string;
}
