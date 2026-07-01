import { waitUntil } from "@vercel/functions";
import type { HouseholdPublic } from "@/lib/household/types";
import type { TelegramWebAppUser } from "@/lib/telegram/init-data";
import { logHouseholdMemberToGoogleSheet, type HouseholdMemberLogAction } from "@/lib/google-sheets";

/** Дожидается завершения записи на Vercel (void обрывается после ответа API). */
export function scheduleHouseholdMemberGoogleSheetLog(opts: {
  action: HouseholdMemberLogAction;
  tgUser: TelegramWebAppUser;
  household?: HouseholdPublic | null;
  logTag?: string;
  onSuccess?: () => Promise<void>;
}): void {
  const tag = opts.logTag ?? `google-sheets/${opts.action}`;
  waitUntil(
    logHouseholdMemberToGoogleSheet({
      action: opts.action,
      tgUser: opts.tgUser,
      household: opts.household,
    })
      .then(() => opts.onSuccess?.())
      .catch((err) => console.error(`[${tag}]`, err)),
  );
}
