CREATE TYPE "JobPublicationChannel" AS ENUM ('PUBLIC_MARKETPLACE', 'PRIVATE_COMPANY_PORTAL', 'BRANDED_CAREER_SITE');
CREATE TYPE "CareerPortalType" AS ENUM ('MARKETPLACE', 'COMPANY_PORTAL', 'CAREER_SITE');
CREATE TYPE "CareerPortalAccess" AS ENUM ('PUBLIC', 'PRIVATE', 'INVITATION_ONLY');
CREATE TYPE "JobPublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');
CREATE TYPE "ApplicantSessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TABLE "ApplicantIdentity" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "email" TEXT NOT NULL,
  "legacyAccountId" TEXT,
  "passwordHash" TEXT,
  "emailVerifiedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApplicantIdentity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApplicantIdentity_email_key" ON "ApplicantIdentity"("email");
CREATE UNIQUE INDEX "ApplicantIdentity_legacyAccountId_key" ON "ApplicantIdentity"("legacyAccountId");
CREATE INDEX "ApplicantIdentity_status_idx" ON "ApplicantIdentity"("status");

CREATE TABLE "ApplicantProfile" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "identityId" TEXT NOT NULL,
  "fullName" TEXT,
  "phone" TEXT,
  "city" TEXT,
  "linkedinUrl" TEXT,
  "portfolioUrl" TEXT,
  "resumeUrl" TEXT,
  "locale" TEXT NOT NULL DEFAULT 'es',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApplicantProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApplicantProfile_identityId_key" ON "ApplicantProfile"("identityId");
CREATE INDEX "ApplicantProfile_city_idx" ON "ApplicantProfile"("city");

CREATE TABLE "CompanyApplicant" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "profileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyApplicant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CompanyApplicant_tenantId_identityId_key" ON "CompanyApplicant"("tenantId", "identityId");
CREATE INDEX "CompanyApplicant_tenantId_createdAt_idx" ON "CompanyApplicant"("tenantId", "createdAt");

CREATE TABLE "CareerPortal" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "CareerPortalType" NOT NULL,
  "access" "CareerPortalAccess" NOT NULL DEFAULT 'PUBLIC',
  "domain" TEXT,
  "subdomain" TEXT,
  "pathPrefix" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CareerPortal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CareerPortal_slug_key" ON "CareerPortal"("slug");
CREATE INDEX "CareerPortal_tenantId_isActive_idx" ON "CareerPortal"("tenantId", "isActive");
CREATE INDEX "CareerPortal_domain_isActive_idx" ON "CareerPortal"("domain", "isActive");
CREATE INDEX "CareerPortal_subdomain_isActive_idx" ON "CareerPortal"("subdomain", "isActive");

CREATE TABLE "CareerPortalBranding" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "portalId" TEXT NOT NULL,
  "logoUrl" TEXT,
  "faviconUrl" TEXT,
  "primaryColor" TEXT,
  "secondaryColor" TEXT,
  "fontFamily" TEXT,
  "customCss" TEXT,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CareerPortalBranding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CareerPortalBranding_portalId_key" ON "CareerPortalBranding"("portalId");

CREATE TABLE "JobPublication" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "vacancyId" TEXT NOT NULL,
  "portalId" TEXT,
  "channel" "JobPublicationChannel" NOT NULL,
  "status" "JobPublicationStatus" NOT NULL DEFAULT 'DRAFT',
  "publicSlug" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "closesAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobPublication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JobPublication_channel_publicSlug_key" ON "JobPublication"("channel", "publicSlug");
CREATE UNIQUE INDEX "JobPublication_vacancyId_channel_portalId_key" ON "JobPublication"("vacancyId", "channel", "portalId");
CREATE INDEX "JobPublication_tenantId_channel_status_idx" ON "JobPublication"("tenantId", "channel", "status");
CREATE INDEX "JobPublication_portalId_status_publishedAt_idx" ON "JobPublication"("portalId", "status", "publishedAt");

CREATE TABLE "PortalApplicantSession" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "identityId" TEXT NOT NULL,
  "portalId" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "status" "ApplicantSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalApplicantSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PortalApplicantSession_refreshTokenHash_key" ON "PortalApplicantSession"("refreshTokenHash");
CREATE INDEX "PortalApplicantSession_identityId_status_expiresAt_idx" ON "PortalApplicantSession"("identityId", "status", "expiresAt");
CREATE INDEX "PortalApplicantSession_portalId_status_idx" ON "PortalApplicantSession"("portalId", "status");

CREATE TABLE "ApplicantInvitation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "portalId" TEXT,
  "identityId" TEXT,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicantInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApplicantInvitation_tokenHash_key" ON "ApplicantInvitation"("tokenHash");
CREATE INDEX "ApplicantInvitation_tenantId_email_expiresAt_idx" ON "ApplicantInvitation"("tenantId", "email", "expiresAt");

ALTER TABLE "ApplicantProfile" ADD CONSTRAINT "ApplicantProfile_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "ApplicantIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicantIdentity" ADD CONSTRAINT "ApplicantIdentity_legacyAccountId_fkey" FOREIGN KEY ("legacyAccountId") REFERENCES "CandidateAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyApplicant" ADD CONSTRAINT "CompanyApplicant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyApplicant" ADD CONSTRAINT "CompanyApplicant_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "ApplicantIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyApplicant" ADD CONSTRAINT "CompanyApplicant_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ApplicantProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareerPortal" ADD CONSTRAINT "CareerPortal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareerPortalBranding" ADD CONSTRAINT "CareerPortalBranding_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "CareerPortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobPublication" ADD CONSTRAINT "JobPublication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobPublication" ADD CONSTRAINT "JobPublication_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobPublication" ADD CONSTRAINT "JobPublication_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "CareerPortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortalApplicantSession" ADD CONSTRAINT "PortalApplicantSession_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "ApplicantIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortalApplicantSession" ADD CONSTRAINT "PortalApplicantSession_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "CareerPortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicantInvitation" ADD CONSTRAINT "ApplicantInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicantInvitation" ADD CONSTRAINT "ApplicantInvitation_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "CareerPortal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApplicantInvitation" ADD CONSTRAINT "ApplicantInvitation_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "ApplicantIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Tenant" ADD COLUMN "marketplaceEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Keep the existing public vacancy catalog available through the publication model.
INSERT INTO "CareerPortal" ("id", "slug", "name", "type", "access", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'marketplace', 'Public job marketplace', 'MARKETPLACE', 'PUBLIC', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "CareerPortal" WHERE "slug" = 'marketplace');

INSERT INTO "JobPublication" ("id", "tenantId", "vacancyId", "portalId", "channel", "status", "publicSlug", "publishedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v."tenantId", v."id", p."id", 'PUBLIC_MARKETPLACE', 'PUBLISHED', v."id", v."createdAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Vacancy" v
CROSS JOIN (SELECT "id" FROM "CareerPortal" WHERE "slug" = 'marketplace') p
WHERE v."status" = 'OPEN'
  AND NOT EXISTS (
    SELECT 1 FROM "JobPublication" jp
    WHERE jp."vacancyId" = v."id" AND jp."channel" = 'PUBLIC_MARKETPLACE'
  );
