import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewCompanyRegistrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNotes?: string;
}
