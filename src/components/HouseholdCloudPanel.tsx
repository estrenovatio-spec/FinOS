"use client";

import { useEffect, useState } from "react";
import { CloudSyncActions } from "@/components/CloudSyncActions";
import { PaywallPanel } from "@/components/PaywallPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isCloudPaused } from "@/lib/cloud/cloud-pause";
import { useHouseholdCloud } from "@/hooks/useHouseholdCloud";
import { t } from "@/lib/i18n";
import { useCloudStore } from "@/store/useCloudStore";

function mapCloudError(locale: "ru" | "en", error: string): string {
  if (error === "invalid_email") {
    return locale === "ru" ? "Введите корректный email." : "Enter a valid email.";
  }
  if (error === "provider_unavailable") {
    return locale === "ru"
      ? "Не удалось отправить код. Попробуйте позже."
      : "The sign-in code could not be sent. Please try again later.";
  }
  if (error === "cooldown_active") {
    return locale === "ru"
      ? "Новый код можно запросить чуть позже."
      : "You can request a new code a little later.";
  }
  if (error === "rate_limited") {
    return locale === "ru"
      ? "Слишком много запросов. Попробуйте позже."
      : "Too many requests. Please try again later.";
  }
  if (error === "otp_invalid") {
    return locale === "ru" ? "Код не подошёл." : "The code is invalid.";
  }
  if (error === "otp_expired") {
    return locale === "ru" ? "Срок действия кода истёк." : "The code has expired.";
  }
  if (error === "otp_attempts_exceeded") {
    return locale === "ru"
      ? "Превышено число попыток. Запросите новый код."
      : "Too many attempts. Request a new code.";
  }
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
  const locale = useCloudStore.persist?.hasHydrated?.() ? useCloudStore.getState().authMethod === "email" ? "ru" : "ru" : "ru";
  const {
    loading,
    error,
    household,
    requestEmailCode,
    verifyEmailCode,
    logoutCloudSession,
    authEmail,
    isActive,
    subscription,
    subscriptionRequired,
  } = useHouseholdCloud();
  const [authStep, setAuthStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = window.setTimeout(() => {
      setOtpCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [otpCooldown]);

  const cloudAuthEnabled = process.env.NEXT_PUBLIC_CLOUD_SYNC_ENABLED !== "false";

  if (!cloudAuthEnabled) {
    return (
      <div className={shellClass(embedded, "space-y-3 rounded-lg border border-dashed border-border/70 p-3")}>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">
            {locale === "ru" ? "Аккаунт и синхронизация" : "Account and sync"}
          </p>
          <p className="break-words text-xs text-muted-foreground">
            {locale === "ru"
              ? "Синхронизация пока отключена для этого окружения."
              : "Sync is disabled in this environment for now."}
          </p>
        </div>
      </div>
    );
  }

  if (subscriptionRequired && subscription) {
    return (
      <div className={`${responsiveShell} ${shellClass(embedded, "space-y-3")}`}>
        <PaywallPanel subscription={subscription} />
        {error && <p className="text-xs text-destructive">{mapCloudError(locale, error)}</p>}
      </div>
    );
  }

  const cloudPaused = isCloudPaused();
  const activeSession = Boolean(isActive && household);

  if (!activeSession) {
    return (
      <div
        className={shellClass(
          embedded,
          "space-y-3 rounded-lg border border-dashed border-border/70 p-3",
        )}
      >
        {authStep === "email" ? (
          <>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">
                {locale === "ru" ? "Аккаунт и синхронизация" : "Account and sync"}
              </p>
              <p className="break-words text-xs text-muted-foreground">
                {locale === "ru"
                  ? "Войдите, чтобы использовать FIN OS на телефоне и компьютере."
                  : "Sign in to use FIN OS on both your phone and computer."}
              </p>
            </div>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              inputMode="email"
              autoComplete="email"
            />
            <Button
              type="button"
              className="w-full"
              disabled={loading || email.trim().length < 3}
              onClick={async () => {
                const result = await requestEmailCode(email);
                if (!result) return;
                setMaskedEmail(result.maskedEmail ?? email.trim());
                setOtpCooldown(result.cooldownSeconds ?? 60);
                setOtpCode("");
                setAuthStep("code");
              }}
            >
              {locale === "ru" ? "Получить код" : "Get code"}
            </Button>
          </>
        ) : (
          <>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">
                {locale === "ru" ? "Введите код из письма" : "Enter the code from your email"}
              </p>
              <p className="break-words text-xs text-muted-foreground">
                {maskedEmail ??
                  (locale === "ru"
                    ? "Код отправлен на ваш email."
                    : "The code was sent to your email.")}
              </p>
            </div>
            <Input
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
            <Button
              type="button"
              className="w-full"
              disabled={loading || otpCode.length !== 6}
              onClick={async () => {
                const ok = await verifyEmailCode(email, otpCode);
                if (!ok) return;
                setAuthStep("email");
              }}
            >
              {locale === "ru" ? "Войти" : "Sign in"}
            </Button>
            <button
              type="button"
              className="w-full text-xs text-muted-foreground underline disabled:no-underline"
              disabled={loading || otpCooldown > 0}
              onClick={async () => {
                const result = await requestEmailCode(email);
                if (!result) return;
                setMaskedEmail(result.maskedEmail ?? email.trim());
                setOtpCooldown(result.cooldownSeconds ?? 60);
              }}
            >
              {otpCooldown > 0
                ? locale === "ru"
                  ? `Отправить код повторно через ${otpCooldown} сек.`
                  : `Resend code in ${otpCooldown}s`
                : locale === "ru"
                  ? "Отправить код повторно"
                : "Resend code"}
            </button>
          </>
        )}
        {error && <p className="text-xs text-destructive">{mapCloudError(locale, error)}</p>}
      </div>
    );
  }

  if (activeSession && household) {
    return (
      <div className="min-w-0 max-w-full space-y-3 overflow-hidden rounded-lg border bg-muted/30 p-3">
        <div className="min-w-0 space-y-1">
          <p className="break-words text-sm font-medium">
            {locale === "ru" ? "Аккаунт и синхронизация" : "Account and sync"}
          </p>
          {authEmail ? (
            <p className="break-words text-xs text-muted-foreground">{authEmail}</p>
          ) : null}
          <p className="break-words text-xs text-muted-foreground">
            {locale === "ru"
              ? cloudPaused
                ? "Нет соединения — изменения сохранятся автоматически."
                : "Синхронизация включена"
              : cloudPaused
                ? "No connection — changes will sync automatically."
                : "Sync is enabled"}
          </p>
          <p className="break-words text-xs text-muted-foreground">
            {locale === "ru"
              ? cloudPaused
                ? "Повторим автоматически после подключения."
                : "Все данные сохранены"
              : cloudPaused
                ? "We will retry automatically when the connection returns."
                : "All data is saved"}
          </p>
        </div>

        {cloudPaused ? (
          <div className="space-y-1 rounded-lg border border-amber-400/30 bg-amber-50 p-3 dark:bg-amber-950/20">
            <p className="text-sm font-medium text-amber-950 dark:text-amber-50">
              {locale === "ru" ? "Синхронизация на паузе" : "Sync is paused"}
            </p>
            <p className="text-xs leading-snug text-amber-900/80 dark:text-amber-100/80">
              {locale === "ru"
                ? "Синхронизация была остановлена локально. Приложение снимет блокировку автоматически и подтянет данные."
                : "Cloud sync was paused locally. The app will clear it automatically and pull fresh data."}
            </p>
          </div>
        ) : null}

        <CloudSyncActions embedded showReplace={false} />
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={loading}
          onClick={() => void logoutCloudSession()}
        >
          {locale === "ru" ? "Выйти" : "Log out"}
        </Button>

        {error && <p className="text-xs text-destructive">{mapCloudError(locale, error)}</p>}
      </div>
    );
  }
  return null;
}
