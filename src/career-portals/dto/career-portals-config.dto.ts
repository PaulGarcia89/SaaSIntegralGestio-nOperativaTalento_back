import { CareerPortalAccess } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsHexColor, IsOptional, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';

export class CareerPortalBrandingDto {
  @IsOptional() @IsUrl() @MaxLength(500) logoUrl?: string;
  @IsOptional() @IsUrl() @MaxLength(500) faviconUrl?: string;
  @IsOptional() @IsHexColor() primaryColor?: string;
  @IsOptional() @IsHexColor() secondaryColor?: string;
  @IsOptional() @IsHexColor() accentColor?: string;
  @IsOptional() @IsHexColor() backgroundColor?: string;
  @IsOptional() @IsHexColor() textColor?: string;
  @IsOptional() @IsString() @MaxLength(120) fontFamily?: string;
  @IsOptional() @IsString() @MaxLength(20000) customCss?: string;
  @IsOptional() @IsUrl() @MaxLength(500) heroImageUrl?: string;
  @IsOptional() @IsString() @MaxLength(10000) footerText?: string;
  @IsOptional() @IsEmail() @MaxLength(160) supportEmail?: string;
  @IsOptional() @IsString() @MaxLength(180) title?: string;
  @IsOptional() @IsString() @MaxLength(500) subtitle?: string;
  @IsOptional() @IsString() @MaxLength(180) seoTitle?: string;
  @IsOptional() @IsString() @MaxLength(500) seoDescription?: string;
}

export class CareerPortalChannelConfigDto {
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsString() @MaxLength(120) slug?: string;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsEnum(CareerPortalAccess) access?: CareerPortalAccess;
  @IsOptional() @IsString() @MaxLength(255) domain?: string;
  @IsOptional() @IsString() @MaxLength(255) subdomain?: string;
  @IsOptional() @IsString() @MaxLength(255) pathPrefix?: string;
  @IsOptional() @ValidateNested() @Type(() => CareerPortalBrandingDto) branding?: CareerPortalBrandingDto;
}

export class UpdateCareerPortalsConfigDto {
  @IsOptional() @IsBoolean() marketplaceEnabled?: boolean;
  @IsOptional() @ValidateNested() @Type(() => CareerPortalChannelConfigDto) companyPortal?: CareerPortalChannelConfigDto;
  @IsOptional() @ValidateNested() @Type(() => CareerPortalChannelConfigDto) brandedCareerSite?: CareerPortalChannelConfigDto;
}
