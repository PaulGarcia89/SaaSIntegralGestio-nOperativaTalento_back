import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class CreateSignatureTemplateDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() title!: string;
  @IsString() content!: string;
  @IsString() consentText!: string;
  @IsOptional() @IsIn(['INTERNAL', 'DOCUSIGN', 'DROPBOX_SIGN']) provider?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class SignatureParticipantInputDto {
  @IsEmail() email!: string;
  @IsString() fullName!: string;
  @IsOptional() @IsString() roleLabel?: string;
}

export class CreateSignaturePackageDto {
  @IsUUID() onboardingFlowId!: string;
  @IsUUID() templateId!: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => SignatureParticipantInputDto)
  participants!: SignatureParticipantInputDto[];
}

export class SubmitSignatureConsentDto {
  @IsBoolean() accepted!: boolean;
  @IsString() typedName!: string;
}
