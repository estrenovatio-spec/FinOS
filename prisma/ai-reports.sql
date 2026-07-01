-- История AI-отчётов (недельный / месячный). Выполнить в Supabase SQL Editor.

CREATE TYPE "AiAnalysisKind" AS ENUM ('weekly', 'monthly');

CREATE TABLE IF NOT EXISTS "AiAnalysisReport" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "AiAnalysisKind" NOT NULL,
  "periodStart" TEXT NOT NULL,
  "periodEnd" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'ru',
  "tips" JSONB NOT NULL,
  "fallback" BOOLEAN NOT NULL DEFAULT false,
  "summaryJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiAnalysisReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiAnalysisReport_userId_kind_createdAt_idx"
  ON "AiAnalysisReport"("userId", "kind", "createdAt" DESC);

ALTER TABLE "AiAnalysisReport"
  ADD CONSTRAINT "AiAnalysisReport_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
