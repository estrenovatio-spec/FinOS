import { NextResponse } from "next/server";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { isLlmConfigured } from "@/lib/llm";
import {
  isPaymentsConfigured,
  subscriptionBillingTestMode,
  subscriptionEnforced,
  subscriptionTrialDays,
} from "@/lib/payments/config";
import { referralsEnabled } from "@/lib/referrals/config";
import { isReferralSchemaReady } from "@/lib/referrals/schema-ready";
import { getBillingDevTelegramId } from "@/lib/billing/dev-telegram-id";
import { getPublicSiteUrl } from "@/lib/site-url";
import { getTelegramBotName } from "@/lib/telegram/bot-name";
import { fetchTelegramBotUsername } from "@/lib/telegram/bot-identity";
import {
  getTelegramBotTokenForEnv,
  isTelegramPreviewTokenConfigured,
  isTelegramBotConfigured,
} from "@/lib/telegram/bot-token";
import { listSttProviderIds } from "@/lib/stt-providers";
import {
  formatRecognitionStatus,
  nextRecognitionPhrase,
} from "@/lib/recognition-phrases";

export const dynamic = "force-dynamic";

const BUILD_TAG =
  process.env.VERCEL_DEPLOYMENT_ID?.slice(0, 7) ??
  process.env.NEXT_PUBLIC_BUILD_TAG ??
  process.env.VERCEL_ENV ??
  "dev";

export async function GET() {
  const telegramToken = Boolean(getTelegramBotTokenForEnv());
  const tokenBotUsername = await fetchTelegramBotUsername(getTelegramBotTokenForEnv());
  const expectedBotName = getTelegramBotName();
  const telegramTokenMatchesBotName =
    tokenBotUsername && expectedBotName
      ? tokenBotUsername.toLowerCase() === expectedBotName.replace(/^@/, "").toLowerCase()
      : null;
  const databaseUrl = isDatabaseConfigured();
  const databaseUrlHint = !databaseUrl
    ? "DATABASE_URL на Vercel пустой или неверный (должен начинаться с postgresql://)"
    : undefined;
  const sessionSecret = Boolean(
    process.env.HOUSEHOLD_SESSION_SECRET?.trim() || process.env.RATE_LIMIT_SECRET?.trim(),
  );
  const llm = isLlmConfigured();

  let dbTables = false;
  let planningTables = false;
  let planningColumnsOk = false;
  let vehicleGarageTables = false;
  let dbError: string | undefined;

  if (databaseUrl) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await prisma.household.findFirst({ take: 1 });
      dbTables = true;

      const planningRows = await prisma.$queryRaw<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'SavingsGoal',
            'CategoryBudget',
            'RecurringTransaction',
            'Subscription',
            'Payment'
          )
      `;
      planningTables = planningRows.length >= 5;

      const requiredCols = await prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'SavingsGoal' AND column_name = 'monthlyContribution')
            OR (table_name = 'Household' AND column_name = 'balanceOffsets')
            OR (table_name = 'Transaction' AND column_name = 'confirmed')
          )
      `;
      const names = new Set(requiredCols.map((r) => r.column_name));
      planningColumnsOk =
        names.has("monthlyContribution") &&
        names.has("balanceOffsets") &&
        names.has("confirmed");

      const garageRows = await prisma.$queryRaw<{ ok: number }[]>`
        SELECT 1 AS ok
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Vehicle'
        LIMIT 1
      `;
      const garageCols = await prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Household'
          AND column_name IN ('vehicleGarageMode', 'vehicleMemberPrefs')
      `;
      vehicleGarageTables = garageRows.length > 0 && garageCols.length >= 2;
    } catch (e) {
      dbError = e instanceof Error ? e.message.slice(0, 280) : "unknown";
    }
  }

  const usesSupabaseDirect =
    Boolean(process.env.DATABASE_URL?.includes(".supabase.co:5432")) ||
    Boolean(dbError?.includes(".supabase.co:5432"));

  return NextResponse.json({
    ok: dbTables && telegramToken && llm,
    buildTag: BUILD_TAG,
    recognitionPhraseSample: formatRecognitionStatus(
      nextRecognitionPhrase("healthcheck"),
    ),
    telegramToken,
    databaseUrl,
    sessionSecret,
    llm,
    sttProviders: listSttProviderIds(),
    sttReady: listSttProviderIds().length > 0,
    paymentsConfigured: isPaymentsConfigured(),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    billingTestMode: subscriptionBillingTestMode(),
    billingDevFallback: Boolean(getBillingDevTelegramId()),
    billingDevTelegramIdHint: (() => {
      const id = getBillingDevTelegramId();
      if (!id || id.length < 6) return id ?? null;
      return `${id.slice(0, 3)}…${id.slice(-3)}`;
    })(),
    subscriptionEnforced: subscriptionEnforced(),
    referralsEnabled: referralsEnabled(),
    referralSchemaReady: databaseUrl ? await isReferralSchemaReady() : false,
    subscriptionTrialDays: subscriptionTrialDays(),
    trialBannerServerReady:
      subscriptionBillingTestMode() && subscriptionEnforced() && subscriptionTrialDays() > 0,
    telegramPreviewTokenSet: isTelegramPreviewTokenConfigured(),
    telegramBotName: expectedBotName,
    telegramTokenBotUsername: tokenBotUsername,
    telegramTokenMatchesBotName,
    telegramBotConfigured: isTelegramBotConfigured(),
    ...(telegramTokenMatchesBotName === false
      ? {
          telegramTokenHint:
            `TELEGRAM_BOT_TOKEN_PREVIEW на Vercel — это @${tokenBotUsername}, нужен @${expectedBotName}. BotFather → API Token → обновить переменную → Redeploy.`,
        }
      : {}),
    siteUrl: getPublicSiteUrl(),
    siteUrlPreviewEnv: Boolean(
      process.env.NEXT_PUBLIC_SITE_URL_PREVIEW?.trim() ||
        process.env.NEXT_PUBLIC_SITE_URL_preview?.trim(),
    ),
    dbTables,
    planningTables,
    planningColumnsOk,
    vehicleGarageTables,
    ...(planningTables && !planningColumnsOk
      ? {
          dbMigrateHint:
            "В Supabase SQL Editor выполните файл prisma/migrate-planning-and-balance.sql",
        }
      : {}),
    ...(!vehicleGarageTables
      ? {
          vehicleGarageHint:
            "Гараж опционален: prisma/vehicle-garage-v2.sql только на нужной БД (см. prisma/MIGRATIONS.md)",
        }
      : {}),
    googleSheetsConfigured: Boolean(process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim()),
    dbError,
    databaseUrlHint,
    ...(usesSupabaseDirect
      ? {
          fix:
            "На Vercel замените DATABASE_URL на Transaction pooler (порт 6543, хост *.pooler.supabase.com) и добавьте ?pgbouncer=true. Затем Redeploy.",
        }
      : {}),
  });
}
