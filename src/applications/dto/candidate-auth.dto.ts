import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

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
