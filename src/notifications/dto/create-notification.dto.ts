import { NotificationCategory, NotificationType } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';

export class CreateNotificationDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsEnum(NotificationType)
  type!: NotificationType;

  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(1000)
  message!: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sourceModule?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  actionUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  correlationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  deduplicationKey?: string;
}
