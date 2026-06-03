-- AddPendingExportState
-- SQLite stores Prisma enums as TEXT, so existing rows remain valid.

-- AlterTable
ALTER TABLE "ExportAttempt" ADD COLUMN "dedupeKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ExportAttempt_dedupeKey_key" ON "ExportAttempt"("dedupeKey");
