-- Реферальный кошелёк: баланс и ожидающие начисления (руб.)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralWalletBalanceRub" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralWalletPendingRub" DOUBLE PRECISION NOT NULL DEFAULT 0;
