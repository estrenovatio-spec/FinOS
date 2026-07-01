"use client";

import { useEffect, useRef, useState } from "react";
import { ArchiveRestorePanel } from "@/components/ArchiveRestorePanel";
import { CloudSyncActions } from "@/components/CloudSyncActions";
import { PaywallPanel } from "@/components/PaywallPanel";
import { PromoCodeRedeem } from "@/components/PromoCodeRedeem";
import { ReferralWalletPaywall } from "@/components/ReferralWalletPaywall";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { runHouseholdBootstrap } from "@/lib/cloud/bootstrap";
import { hasCloudAuth } from "@/lib/cloud/auth-payload";
import { isCloudPaused } from "@/lib/cloud/cloud-pause";
import { useHouseholdCloud } from "@/hooks/useHouseholdCloud";
import { t } from "@/lib/i18n";
import { useStore } from "@/store/useStore";

const TG_BOT = process.env.NEXT_PUBLIC_TG_BOT_NAME?.replace(/^@/, "") ?? "";

function mapCloudError(locale: "ru" | "en", error: string): string {
  const key =
    error === "database_not_configured" || error === "db_unavailable"
      ? "cloudErrDbUnavailable"
      : error === "telegram_required"
        ? "cloudErrTelegram"
        : error === "invalid_init_data"
          ? "cloudErrTelegramAuth"
          : error === "referral_link_not_household"
            ? "cloudErrReferralNotHousehold"
            : error === "not_found" || error === "household_not_found" || error === "invalid_code"
            ? "cloudErrInviteCode"
            : error === "unauthorized" || error === "forbidden"
              ? "cloudErrUnauthorized"
              : error === "subscription_required"
                ? "paywallTitle"
                : error === "already_in_household"
                  ? "cloudErrAlreadyInHousehold"
                  : error === "household_leave_forbidden"
                    ? "cloudErrLeaveForbidden"
                    : "cloudErrGeneric";
  const text = t(locale, key);
  if (key === "cloudErrGeneric" && error && error !== "create_failed") {
    return `${text} Код: ${error}`;
  }
  return text;
}

type HouseholdCloudPanelProps = {
  /** Без внешней рамки — секция SettingsSection в настройках */
  embedded?: boolean;
};

function shellClass(embedded: boolean, base: string, embeddedClass = "space-y-3") {
  return embedded ? embeddedClass : base;
}

const responsiveShell = "min-w-0 max-w-full overflow-hidden";

export function HouseholdCloudPanel({ embedded = false }: HouseholdCloudPanelProps) {
  const locale = useStore((s) => s.locale);
  const partnerName = useStore((s) => s.partnerName);
  const txCount = useStore((s) => s.transactions.length);
  const { toast } = useToast();
  const {
    loading,
    error,
    household,
    serverConfigured,
    createHousehold,
    joinHousehold,
    replaceCloudWithThisDevice,
    loginWithTelegramWeb,
    attachExistingCloud,
    isTelegram,
    isActive,
    subscription,
    subscriptionRequired,
  } = useHouseholdCloud();

  const [mode, setMode] = useState<"solo" | "shared">("solo");
  const [joinCode, setJoinCode] = useState("");
  const [partnerLabel, setPartnerLabel] = useState(partnerName ?? "");
  const [showNewHousehold, setShowNewHousehold] = useState(false);
  const autoAttachStarted = useRef(false);

  const handleReplaceCloud = async () => {
    if (!window.confirm(t(locale, "cloudSyncReplaceConfirm"))) return;
    const ok = await replaceCloudWithThisDevice();
    toast(ok ? t(locale, "cloudSyncSuccessReplace") : t(locale, "cloudSyncFailed"), ok ? "success" : "error");
  };

  const loggedInWeb = !isTelegram && hasCloudAuth() && !isActive;

  useEffect(() => {
    if (!loggedInWeb || isActive || autoAttachStarted.current) return;
    autoAttachStarted.current = true;
    void attachExistingCloud();
  }, [loggedInWeb, isActive, attachExistingCloud]);

  if (subscriptionRequired && subscription) {
    return (
      <div className={`${responsiveShell} ${shellClass(embedded, "space-y-3")}`}>
        <PaywallPanel subscription={subscription} />
        {household && (
          <p className="text-xs text-muted-foreground">{t(locale, "paywallHouseholdPaused")}</p>
        )}
        {error && <p className="text-xs text-destructive">{mapCloudError(locale, error)}</p>}
      </div>
    );
  }

  const cloudPaused = isCloudPaused();

  if (!isTelegram && !isActive && !hasCloudAuth()) {
    return (
      <div
        className={shellClass(
          embedded,
          "space-y-3 rounded-lg border border-dashed border-border/70 p-3",
        )}
      >
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">{t(locale, "cloudWebLoginTitle")}</p>
          <p className="break-words text-xs text-muted-foreground">{t(locale, "cloudWebLoginHint")}</p>
        </div>
        <TelegramLoginButton
          botUsername={TG_BOT}
          onAuth={(user) => void loginWithTelegramWeb(user)}
        />
        {error && <p className="text-xs text-destructive">{mapCloudError(locale, error)}</p>}
      </div>
    );
  }

  if (isActive && household) {
    const expiresLabel =
      subscription?.expiresAt &&
      new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(subscription.expiresAt));

    return (
      <div className="min-w-0 max-w-full space-y-3 overflow-hidden rounded-lg border bg-muted/30 p-3">
        <div className="min-w-0 space-y-1">
          <p className="break-words text-sm font-medium">{t(locale, "cloudActiveTitle")}</p>
          <p className="break-words text-xs text-muted-foreground">
            {household.mode === "solo"
              ? t(locale, "cloudModeSolo")
              : t(locale, "cloudModeShared")}
            {" · "}
            {t(locale, "cloudMembers", { count: String(household.memberCount) })}
          </p>
          {subscription?.enforced && expiresLabel && (
            <p className="break-words text-xs text-muted-foreground">
              {t(locale, "paywallActiveUntil", { date: expiresLabel })}
            </p>
          )}
        </div>

        {household.mode === "shared" || household.memberCount < 2 ? (
          <div className="min-w-0 space-y-1">
            <p className="text-xs text-muted-foreground">{t(locale, "cloudInviteHint")}</p>
            <p className="max-w-full break-all font-mono text-lg font-semibold tracking-widest">
              {household.inviteCode}
            </p>
          </div>
        ) : null}

        {cloudPaused ? (
          <div className="space-y-1 rounded-lg border border-amber-400/30 bg-amber-50 p-3 dark:bg-amber-950/20">
            <p className="text-sm font-medium text-amber-950 dark:text-amber-50">
              {t(locale, "cloudPausedTitle")}
            </p>
            <p className="text-xs leading-snug text-amber-900/80 dark:text-amber-100/80">
              {locale === "ru"
                ? "Синхронизация была остановлена локально. Приложение снимет блокировку автоматически и подтянет данные."
                : "Cloud sync was paused locally. The app will clear it automatically and pull fresh data."}
            </p>
          </div>
        ) : null}

        <CloudSyncActions embedded showReplace={false} />
        <ArchiveRestorePanel />

        {subscription?.enforced && subscription.active && (
          <>
            <ReferralWalletPaywall
              priceRub={subscription.priceRub}
              onPaid={() => void runHouseholdBootstrap()}
            />
            <PromoCodeRedeem compact onRedeemed={() => void runHouseholdBootstrap()} />
          </>
        )}

        {error && <p className="text-xs text-destructive">{mapCloudError(locale, error)}</p>}
      </div>
    );
  }

  if (loggedInWeb && !showNewHousehold) {
    return (
      <div
        className={shellClass(
          embedded,
          "space-y-3 rounded-lg border border-dashed border-border/70 p-3",
        )}
      >
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">{t(locale, "cloudWebAttachTitle")}</p>
          <p className="break-words text-xs text-muted-foreground">{t(locale, "cloudWebAttachHint")}</p>
        </div>
        <Button
          type="button"
          className="w-full"
          disabled={loading}
          onClick={() => void attachExistingCloud()}
        >
          {loading ? t(locale, "cloudWebAttachLoading") : t(locale, "cloudWebAttachBtn")}
        </Button>
        <button
          type="button"
          className="w-full text-xs text-muted-foreground underline"
          onClick={() => setShowNewHousehold(true)}
        >
          {t(locale, "cloudWebCreateAnyway")}
        </button>
        {error && <p className="text-xs text-destructive">{mapCloudError(locale, error)}</p>}
      </div>
    );
  }

  return (
    <div
      className={shellClass(
        embedded,
        "space-y-3 rounded-lg border border-dashed border-border/70 p-3",
      )}
    >
      {serverConfigured === false && (
        <p className="rounded-md border border-amber-400/40 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {t(locale, "cloudNotConfigured")}
        </p>
      )}
      {!embedded ? (
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">{t(locale, "cloudTitle")}</p>
          <p className="break-words text-xs text-muted-foreground">
            {loggedInWeb ? t(locale, "cloudHintNewHousehold") : t(locale, "cloudHint")}
          </p>
        </div>
      ) : (
        <p className="break-words text-xs text-muted-foreground">
          {loggedInWeb ? t(locale, "cloudHintNewHousehold") : t(locale, "cloudHint")}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "solo" ? "default" : "outline"}
          className="min-w-0 whitespace-normal px-2"
          onClick={() => setMode("solo")}
        >
          {t(locale, "cloudSolo")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "shared" ? "default" : "outline"}
          className="min-w-0 whitespace-normal px-2"
          onClick={() => setMode("shared")}
        >
          {t(locale, "cloudShared")}
        </Button>
      </div>

      {mode === "solo" && (
        <div className="space-y-2">
          <p className="break-words text-xs text-muted-foreground">{t(locale, "cloudSoloHint")}</p>
          <Input
            value={partnerLabel}
            onChange={(e) => setPartnerLabel(e.target.value)}
            placeholder={t(locale, "partnerNamePlaceholder")}
          />
        </div>
      )}

      {mode === "shared" && (
        <p className="break-words text-xs text-muted-foreground">{t(locale, "cloudSharedHint")}</p>
      )}

      <Button
        type="button"
        className="w-full"
        disabled={loading}
        onClick={() =>
          void createHousehold({
            mode,
            partnerLabel: mode === "solo" ? partnerLabel.trim() || null : null,
          })
        }
      >
        {t(locale, "cloudCreate")}
      </Button>

      <div className="space-y-2 rounded-md border border-amber-400/40 bg-amber-50/80 p-2.5 dark:bg-amber-950/20">
        <p className="break-words text-xs text-amber-950 dark:text-amber-100">
          {t(locale, "cloudFreshStartHint", { count: String(txCount) })}
        </p>
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-9 w-full whitespace-normal text-xs"
          disabled={loading}
          onClick={() => void handleReplaceCloud()}
        >
          {t(locale, "cloudFreshStart")}
        </Button>
      </div>

      <div className="space-y-2 border-t border-border/60 pt-3">
        <p className="text-xs font-medium">{t(locale, "cloudJoinTitle")}</p>
        <p className="break-words text-[11px] text-muted-foreground">{t(locale, "cloudJoinHint")}</p>
        <Input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder={t(locale, "cloudJoinPlaceholder")}
          className="font-mono uppercase"
        />
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={loading || joinCode.trim().length < 4}
          onClick={() => void joinHousehold(joinCode)}
        >
          {t(locale, "cloudJoin")}
        </Button>
      </div>

      {loggedInWeb && (
        <button
          type="button"
          className="w-full text-xs text-muted-foreground underline"
          onClick={() => {
            setShowNewHousehold(false);
            void attachExistingCloud();
          }}
        >
          {t(locale, "cloudWebBackToAttach")}
        </button>
      )}

      {error && <p className="text-xs text-destructive">{mapCloudError(locale, error)}</p>}

      {subscription?.enforced && subscription.active && (
        <PromoCodeRedeem compact onRedeemed={() => void runHouseholdBootstrap()} />
      )}
    </div>
  );
}
