import { IsArray, IsDateString, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';
export class CreateScormPackageDto {
  @IsUUID() courseId!: string;
  @IsString() @MaxLength(180) title!: string;
  @IsString() version!: string;
  @IsUrl({ require_tld: false }) launchUrl!: string;
  @IsString() checksum!: string;
}
export class CreateTrainingWebhookDto {
  @IsString() @MaxLength(120) name!: string;
  @IsUrl({ protocols: ['https'], require_protocol: true }) endpointUrl!: string;
  @IsArray() @IsString({ each: true }) eventTypes!: string[];
  @IsString() @MaxLength(200) secret!: string;
}
export class CreateXapiStatementDto {
  @IsString() statementId!: string;
  @IsString() verb!: string;
  @IsString() objectId!: string;
  @IsOptional() result?: Record<string, unknown>;
  @IsOptional() context?: Record<string, unknown>;
  @IsDateString() occurredAt!: string;
}
export class CreateTrainingSessionDto {
  @IsString() title!: string;
  @IsDateString() startsAt!: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsUrl({ require_tld: false }) meetingUrl!: string;
  @IsString() timeZone!: string;
  @IsOptional() @IsUUID() courseId?: string;
}
export class RotateTrainingWebhookSecretDto {
  @IsString() @MaxLength(200) secret!: string;
}
