CREATE TABLE "TenantCalendarProviderSettings" (
 "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "provider" "CalendarProvider" NOT NULL,
 "clientId" TEXT, "clientSecretEncrypted" TEXT, "authority" TEXT NOT NULL DEFAULT 'common',
 "calendarId" TEXT NOT NULL DEFAULT 'primary', "connectionId" TEXT, "oauthStateHash" TEXT,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TenantCalendarProviderSettings_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "TenantCalendarProviderSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TenantCalendarProviderSettings_tenantId_provider_key" ON "TenantCalendarProviderSettings"("tenantId", "provider");
CREATE TABLE "TenantInterviewSettings" (
 "tenantId" TEXT NOT NULL, "defaultModality" TEXT NOT NULL DEFAULT 'CUSTOM',
 "durationMinutes" INTEGER NOT NULL DEFAULT 60, "reminderMinutes" INTEGER NOT NULL DEFAULT 60,
 "timezone" TEXT NOT NULL DEFAULT 'America/New_York', "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "TenantInterviewSettings_pkey" PRIMARY KEY ("tenantId"),
 CONSTRAINT "TenantInterviewSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "ApplicationInterview" ADD COLUMN "clientRequestId" TEXT,
 ADD COLUMN "calendarConnectionId" TEXT, ADD COLUMN "externalCalendarId" TEXT,
 ADD COLUMN "externalCalendarUrl" TEXT, ADD COLUMN "additionalAttendees" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN "reminderMinutes" INTEGER NOT NULL DEFAULT 60,
 ADD COLUMN "invitationStatus" TEXT NOT NULL DEFAULT 'PENDING', ADD COLUMN "invitationSentAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "ApplicationInterview_tenantId_clientRequestId_key" ON "ApplicationInterview"("tenantId", "clientRequestId");
