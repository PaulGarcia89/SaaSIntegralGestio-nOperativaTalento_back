import { NotificationCategory, NotificationDigestFrequency } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateNotificationPreferenceDto {
  @IsEnum(NotificationCategory)
  category!: NotificationCategory;

  @IsOptional()
  @IsBoolean()
  internalEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsEnum(NotificationDigestFrequency)
  frequency?: NotificationDigestFrequency;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietHoursStart?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietHoursEnd?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timeZone?: string;
}
