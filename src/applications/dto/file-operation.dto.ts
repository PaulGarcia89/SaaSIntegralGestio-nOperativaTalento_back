import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ReplaceResumeDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class DeleteResumeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}
