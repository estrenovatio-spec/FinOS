-- Push-напоминания об истёкшей подписке (раз в день)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subscriptionReminderSentAt" TIMESTAMP(3);
