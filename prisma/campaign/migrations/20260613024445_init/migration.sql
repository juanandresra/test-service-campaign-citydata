-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CampaignUserStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('WEB', 'MOBILE', 'FIELD', 'PHONE');

-- CreateEnum
CREATE TYPE "CampaignFormStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "campaign" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "research_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "type" "CampaignType" NOT NULL DEFAULT 'WEB',
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "configuration" JSONB,
    "current_form_version" VARCHAR(20),
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_emails" TEXT[],

    CONSTRAINT "campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_form_version" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "status" "CampaignFormStatus" NOT NULL DEFAULT 'DRAFT',
    "schema" JSONB NOT NULL,
    "published_at" TIMESTAMP(3),
    "published_by" UUID,
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_form_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_organization_id_idx" ON "campaign"("organization_id");

-- CreateIndex
CREATE INDEX "campaign_research_id_idx" ON "campaign"("research_id");

-- CreateIndex
CREATE INDEX "campaign_status_idx" ON "campaign"("status");

-- CreateIndex
CREATE INDEX "campaign_organization_id_status_deleted_at_idx" ON "campaign"("organization_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "campaign_organization_id_research_id_idx" ON "campaign"("organization_id", "research_id");

-- CreateIndex
CREATE INDEX "campaign_form_version_campaign_id_idx" ON "campaign_form_version"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_form_version_campaign_id_status_idx" ON "campaign_form_version"("campaign_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_form_version_campaign_id_version_key" ON "campaign_form_version"("campaign_id", "version");

-- AddForeignKey
ALTER TABLE "campaign_form_version" ADD CONSTRAINT "campaign_form_version_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
