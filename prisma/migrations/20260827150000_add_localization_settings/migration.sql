ALTER TABLE "User" ADD COLUMN "preferredLocale" TEXT;
ALTER TABLE "ApplicantIdentity" ADD COLUMN "preferredLocale" TEXT;
ALTER TABLE "Vacancy" ADD COLUMN "translations" JSONB;

CREATE TYPE "LocalizationEmailPolicy" AS ENUM ('RECIPIENT_PREFERENCE', 'COMPANY_DEFAULT', 'EVENT_LOCALE');

CREATE TABLE "PlatformLocalizationSettings" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "defaultLocale" TEXT NOT NULL DEFAULT 'es',
  "fallbackLocale" TEXT NOT NULL DEFAULT 'es',
  "enabledLocales" JSONB NOT NULL DEFAULT '["es","en"]',
  "allowCompanyLocaleConfiguration" BOOLEAN NOT NULL DEFAULT true,
  "detectBrowserLocale" BOOLEAN NOT NULL DEFAULT true,
  "defaultTimeZone" TEXT NOT NULL DEFAULT 'UTC',
  "defaultDateFormat" TEXT,
  "defaultTimeFormat" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformLocalizationSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyLocalizationSettings" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "defaultLocale" TEXT NOT NULL DEFAULT 'es',
  "fallbackLocale" TEXT NOT NULL DEFAULT 'es',
  "enabledLocales" JSONB NOT NULL DEFAULT '["es"]',
  "showLanguageSelector" BOOLEAN NOT NULL DEFAULT true,
  "detectBrowserLocale" BOOLEAN NOT NULL DEFAULT true,
  "emailLocalePolicy" "LocalizationEmailPolicy" NOT NULL DEFAULT 'RECIPIENT_PREFERENCE',
  "defaultTimeZone" TEXT NOT NULL DEFAULT 'UTC',
  "dateFormat" TEXT,
  "timeFormat" TEXT,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyLocalizationSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompanyLocalizationSettings_tenantId_key" UNIQUE ("tenantId"),
  CONSTRAINT "CompanyLocalizationSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CareerPortalLocalizationSettings" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "careerPortalId" TEXT NOT NULL,
  "defaultLocale" TEXT NOT NULL DEFAULT 'es',
  "fallbackLocale" TEXT NOT NULL DEFAULT 'es',
  "enabledLocales" JSONB NOT NULL DEFAULT '["es"]',
  "showLanguageSelector" BOOLEAN NOT NULL DEFAULT true,
  "detectBrowserLocale" BOOLEAN NOT NULL DEFAULT true,
  "useCompanySettings" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" TEXT,
  CONSTRAINT "CareerPortalLocalizationSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CareerPortalLocalizationSettings_careerPortalId_key" UNIQUE ("careerPortalId"),
  CONSTRAINT "CareerPortalLocalizationSettings_careerPortalId_fkey" FOREIGN KEY ("careerPortalId") REFERENCES "CareerPortal"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
