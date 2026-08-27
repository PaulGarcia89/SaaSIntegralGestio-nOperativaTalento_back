import { LocalizationEmailPolicy } from '@prisma/client';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, ArrayNotEmpty } from 'class-validator';

export class LocalizationSettingsDto {
  @IsOptional() @IsIn(['es', 'en']) defaultLocale?: string;
  @IsOptional() @IsIn(['es', 'en']) fallbackLocale?: string;
  @IsOptional() @IsArray() @ArrayNotEmpty() @IsIn(['es', 'en'], { each: true }) enabledLocales?: string[];
  @IsOptional() @IsBoolean() showLanguageSelector?: boolean;
  @IsOptional() @IsBoolean() detectBrowserLocale?: boolean;
  @IsOptional() @IsBoolean() useCompanySettings?: boolean;
  @IsOptional() @IsIn(['RECIPIENT_PREFERENCE', 'COMPANY_DEFAULT', 'EVENT_LOCALE']) emailLocalePolicy?: LocalizationEmailPolicy;
  @IsOptional() @IsString() @MaxLength(80) defaultTimeZone?: string;
  @IsOptional() @IsString() @MaxLength(80) dateFormat?: string;
  @IsOptional() @IsString() @MaxLength(80) timeFormat?: string;
}

export class LocalePreferenceDto {
  @IsIn(['es', 'en']) locale!: string;
}
