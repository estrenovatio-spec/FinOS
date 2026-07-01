-- Promo codes & trial (idempotent — можно запускать повторно)

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "trialGrantedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "bonusDays" INTEGER NOT NULL,
    "maxUses" INTEGER,
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PromoRedemption" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PromoCode_code_key" ON "PromoCode"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "PromoRedemption_promoCodeId_userId_key"
  ON "PromoRedemption"("promoCodeId", "userId");
CREATE INDEX IF NOT EXISTS "PromoRedemption_userId_idx" ON "PromoRedemption"("userId");

DO $$ BEGIN
  ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_promoCodeId_fkey"
    FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Пример: 2 месяца бесплатно (суммируется с trial при активации)
INSERT INTO "PromoCode" ("id", "code", "label", "bonusDays", "maxUses", "active", "updatedAt")
VALUES (
  'promo_naim_dermo',
  'найм дерьмо',
  'Корпоративный промо (2 мес.)',
  60,
  NULL,
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "label" = EXCLUDED."label",
  "bonusDays" = EXCLUDED."bonusDays",
  "active" = EXCLUDED."active",
  "updatedAt" = CURRENT_TIMESTAMP;
