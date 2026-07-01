-- Subscription & payments (idempotent — можно запускать повторно)
DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'expired', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'expired',
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "yookassaPaymentId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_userId_key" ON "Subscription"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_yookassaPaymentId_key" ON "Payment"("yookassaPaymentId");
CREATE INDEX IF NOT EXISTS "Payment_userId_idx" ON "Payment"("userId");

DO $$ BEGIN
  ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
