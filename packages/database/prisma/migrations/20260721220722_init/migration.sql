-- CreateEnum
CREATE TYPE "TerritoryStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXHAUSTED', 'PAUSED');

-- CreateEnum
CREATE TYPE "CategoryStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LegalForm" AS ENUM ('LTD', 'LLP', 'PLC', 'CHARITY', 'SOLE_TRADER', 'PARTNERSHIP', 'PUBLIC_BODY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('DISCOVERED', 'VERIFIED', 'AUDITED', 'SCORED', 'QUALIFIED', 'SELECTED', 'CONTACTED', 'REPLIED', 'CONVERTED', 'DISQUALIFIED', 'SUPPRESSED', 'ANONYMISED');

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('GENERIC', 'ROLE', 'PERSONAL');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('UNVERIFIED', 'VALID', 'INVALID', 'RISKY');

-- CreateEnum
CREATE TYPE "ComplianceDecision" AS ENUM ('CORPORATE_APPROVED', 'CONSENT_REQUIRED', 'MANUAL_REVIEW_REQUIRED', 'DO_NOT_CONTACT', 'SUPPRESSED', 'IDENTITY_UNCONFIRMED', 'EMAIL_UNVERIFIED');

-- CreateEnum
CREATE TYPE "LawfulBasis" AS ENUM ('LEGITIMATE_INTERESTS', 'CONSENT', 'NONE');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('UNSUBSCRIBED', 'COMPLAINT', 'HARD_BOUNCE', 'OBJECTION', 'MANUAL', 'LEGAL');

-- CreateEnum
CREATE TYPE "AssetRightsStatus" AS ENUM ('BUSINESS_OWNED_AND_PERMISSION_CONFIRMED', 'LICENSED_STOCK', 'PROVIDED_BY_OPERATOR', 'GENERATED', 'PLACEHOLDER', 'REFERENCE_ONLY', 'PROHIBITED');

-- CreateEnum
CREATE TYPE "ConceptStatus" AS ENUM ('DRAFT', 'QA_FAILED', 'QA_PASSED', 'DEPLOYED', 'EXPIRED', 'UNPUBLISHED');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('DRAFT', 'QUEUED', 'SCHEDULED', 'SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'REPLIED', 'UNSUBSCRIBED', 'CANCELLED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ConversionStage" AS ENUM ('REPLIED', 'POSITIVE_REPLY', 'MEETING', 'PROPOSAL', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'OPERATOR');

-- CreateTable
CREATE TABLE "Territory" (
    "id" TEXT NOT NULL,
    "localAuthority" TEXT NOT NULL,
    "town" TEXT NOT NULL,
    "district" TEXT,
    "outwardPostcode" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "status" "TerritoryStatus" NOT NULL DEFAULT 'PENDING',
    "lastScannedAt" TIMESTAMP(3),
    "nextScanAt" TIMESTAMP(3),
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "qualifiedCount" INTEGER NOT NULL DEFAULT 0,
    "contactedCount" INTEGER NOT NULL DEFAULT 0,
    "convertedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Territory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "providerTypes" TEXT[],
    "strategyKey" TEXT NOT NULL,
    "status" "CategoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerritoryCategoryScan" (
    "id" TEXT NOT NULL,
    "territoryId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "scannedAt" TIMESTAMP(3),
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "qualifiedCount" INTEGER NOT NULL DEFAULT 0,
    "contactedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerritoryCategoryScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradingName" TEXT,
    "legalName" TEXT,
    "companyNumber" TEXT,
    "legalForm" "LegalForm" NOT NULL DEFAULT 'UNKNOWN',
    "companyStatus" TEXT,
    "categoryId" TEXT NOT NULL,
    "territoryId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "town" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "primaryEmail" TEXT,
    "socialProfiles" JSONB,
    "googleProfileUrl" TEXT,
    "providerPlaceId" TEXT,
    "reviewCount" INTEGER,
    "reviewRating" DOUBLE PRECISION,
    "openingHours" JSONB,
    "services" JSONB,
    "discoverySource" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'MEDIUM',
    "dedupFingerprint" TEXT NOT NULL,
    "status" "BusinessStatus" NOT NULL DEFAULT 'DISCOVERED',
    "isChain" BOOLEAN NOT NULL DEFAULT false,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT,
    "email" TEXT NOT NULL,
    "emailType" "EmailType" NOT NULL,
    "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "validationDetail" TEXT,
    "source" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteAudit" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "auditDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasWebsite" BOOLEAN NOT NULL,
    "robotsAllowed" BOOLEAN NOT NULL DEFAULT true,
    "technicalScore" INTEGER NOT NULL,
    "designScore" INTEGER NOT NULL,
    "conversionScore" INTEGER NOT NULL,
    "contentScore" INTEGER NOT NULL,
    "seoScore" INTEGER NOT NULL,
    "trustScore" INTEGER NOT NULL,
    "opportunityScore" INTEGER NOT NULL,
    "findingsJson" JSONB NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "screenshotPaths" JSONB,

    CONSTRAINT "WebsiteAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectScore" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "componentScores" JSONB NOT NULL,
    "disqualified" BOOLEAN NOT NULL DEFAULT false,
    "disqualificationReason" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceRecord" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "legalForm" "LegalForm" NOT NULL,
    "decision" "ComplianceDecision" NOT NULL,
    "lawfulBasis" "LawfulBasis" NOT NULL DEFAULT 'NONE',
    "legitimateInterestAssessmentId" TEXT,
    "privacyNoticeVersion" TEXT,
    "sourceOfPersonalData" TEXT NOT NULL,
    "decisionReason" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "domain" TEXT,
    "businessId" TEXT,
    "reason" "SuppressionReason" NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" TEXT,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "licenceType" TEXT,
    "rightsStatus" "AssetRightsStatus" NOT NULL,
    "businessOwned" BOOLEAN NOT NULL DEFAULT false,
    "intendedUse" TEXT NOT NULL,
    "localPath" TEXT,
    "attributionRequirement" TEXT,
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ConceptStatus" NOT NULL DEFAULT 'DRAFT',
    "slug" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "htmlPath" TEXT,
    "repositoryPath" TEXT,
    "previewUrl" TEXT,
    "deploymentId" TEXT,
    "siteId" TEXT,
    "buildLogs" TEXT,
    "deployedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "screenshots" JSONB,
    "qaResults" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachEmail" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "conceptId" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "providerMessageId" TEXT,
    "status" "OutreachStatus" NOT NULL DEFAULT 'DRAFT',
    "statusReason" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "complaintAt" TIMESTAMP(3),
    "unsubscribeToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversion" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "stage" "ConversionStage" NOT NULL,
    "estimatedValue" DECIMAL(12,2),
    "actualValue" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "runDate" TEXT NOT NULL,
    "runType" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "selectedBusinesses" JSONB,
    "errors" JSONB,
    "logs" JSONB,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationStage" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "detail" JSONB,

    CONSTRAINT "AutomationStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadLetter" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "stage" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "error" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "DeadLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'OPERATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PolicyDocument" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "PolicyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Territory_status_priority_idx" ON "Territory"("status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "Territory_town_outwardPostcode_key" ON "Territory"("town", "outwardPostcode");

-- CreateIndex
CREATE UNIQUE INDEX "Category_key_key" ON "Category"("key");

-- CreateIndex
CREATE INDEX "TerritoryCategoryScan_status_position_idx" ON "TerritoryCategoryScan"("status", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TerritoryCategoryScan_territoryId_categoryId_key" ON "TerritoryCategoryScan"("territoryId", "categoryId");

-- CreateIndex
CREATE INDEX "Business_status_idx" ON "Business"("status");

-- CreateIndex
CREATE INDEX "Business_town_postcode_idx" ON "Business"("town", "postcode");

-- CreateIndex
CREATE INDEX "Business_categoryId_territoryId_idx" ON "Business"("categoryId", "territoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Business_discoverySource_providerPlaceId_key" ON "Business"("discoverySource", "providerPlaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Business_dedupFingerprint_key" ON "Business"("dedupFingerprint");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_businessId_email_key" ON "Contact"("businessId", "email");

-- CreateIndex
CREATE INDEX "WebsiteAudit_businessId_auditDate_idx" ON "WebsiteAudit"("businessId", "auditDate");

-- CreateIndex
CREATE INDEX "ProspectScore_businessId_calculatedAt_idx" ON "ProspectScore"("businessId", "calculatedAt");

-- CreateIndex
CREATE INDEX "ProspectScore_disqualified_totalScore_idx" ON "ProspectScore"("disqualified", "totalScore");

-- CreateIndex
CREATE INDEX "ComplianceRecord_businessId_checkedAt_idx" ON "ComplianceRecord"("businessId", "checkedAt");

-- CreateIndex
CREATE INDEX "Suppression_email_idx" ON "Suppression"("email");

-- CreateIndex
CREATE INDEX "Suppression_domain_idx" ON "Suppression"("domain");

-- CreateIndex
CREATE INDEX "Suppression_businessId_idx" ON "Suppression"("businessId");

-- CreateIndex
CREATE INDEX "Asset_businessId_rightsStatus_idx" ON "Asset"("businessId", "rightsStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Concept_slug_key" ON "Concept"("slug");

-- CreateIndex
CREATE INDEX "Concept_businessId_version_idx" ON "Concept"("businessId", "version");

-- CreateIndex
CREATE INDEX "Concept_status_expiresAt_idx" ON "Concept"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachEmail_idempotencyKey_key" ON "OutreachEmail"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OutreachEmail_status_scheduledAt_idx" ON "OutreachEmail"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "OutreachEmail_businessId_idx" ON "OutreachEmail"("businessId");

-- CreateIndex
CREATE INDEX "OutreachEmail_sentAt_idx" ON "OutreachEmail"("sentAt");

-- CreateIndex
CREATE INDEX "Conversion_businessId_stage_idx" ON "Conversion"("businessId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRun_runDate_runType_key" ON "AutomationRun"("runDate", "runType");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationStage_runId_name_key" ON "AutomationStage"("runId", "name");

-- CreateIndex
CREATE INDEX "DeadLetter_resolvedAt_idx" ON "DeadLetter"("resolvedAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDocument_key_version_key" ON "PolicyDocument"("key", "version");

-- AddForeignKey
ALTER TABLE "TerritoryCategoryScan" ADD CONSTRAINT "TerritoryCategoryScan_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerritoryCategoryScan" ADD CONSTRAINT "TerritoryCategoryScan_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteAudit" ADD CONSTRAINT "WebsiteAudit_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectScore" ADD CONSTRAINT "ProspectScore_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRecord" ADD CONSTRAINT "ComplianceRecord_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suppression" ADD CONSTRAINT "Suppression_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachEmail" ADD CONSTRAINT "OutreachEmail_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachEmail" ADD CONSTRAINT "OutreachEmail_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachEmail" ADD CONSTRAINT "OutreachEmail_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationStage" ADD CONSTRAINT "AutomationStage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadLetter" ADD CONSTRAINT "DeadLetter_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
