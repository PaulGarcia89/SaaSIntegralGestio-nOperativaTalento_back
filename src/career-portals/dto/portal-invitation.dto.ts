import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class PortalInvitationTokenDto {
  @IsString() @MinLength(20) @MaxLength(200) token!: string;
}

export class CreatePortalInvitationDto extends PortalInvitationTokenDto {
  @IsEmail() @MaxLength(160) email!: string;
}
