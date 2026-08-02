import { CandidatePrivacyRequestType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class WithdrawCandidateApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class CreateCandidatePrivacyRequestDto {
  @IsEnum(CandidatePrivacyRequestType)
  type!: CandidatePrivacyRequestType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
