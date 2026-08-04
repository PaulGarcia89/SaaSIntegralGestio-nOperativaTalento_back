import { AtsConversationStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { OffsetPaginationQueryDto } from '../../common/dto/offset-pagination-query.dto';

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

export class ComposeCandidateEmailDto extends ReplyCandidateEmailDto {}

export class ListAtsConversationsDto extends OffsetPaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @IsOptional() @IsEnum(AtsConversationStatus) status?: AtsConversationStatus;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() assignedToMe?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() unreadOnly?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() archived?: boolean;
}

export class UpdateAtsConversationDto {
  @IsOptional() @IsEnum(AtsConversationStatus) status?: AtsConversationStatus;
  @IsOptional() @IsUUID() assignedUserId?: string | null;
  @IsOptional() @IsDateString() snoozedUntil?: string | null;
  @IsOptional() @IsBoolean() archived?: boolean;
}

export class LinkInboundEmailDto {
  @IsUUID() applicationId!: string;
}

export class ResolveInboundEmailDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}
