"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTelegramWebAppReady } from "@/hooks/useTelegramWebAppReady";
import { getCloudAuthBody, hasCloudAuth } from "@/lib/cloud/auth-payload";
import { runHouseholdBootstrap } from "@/lib/cloud/bootstrap";
import { hasTelegramWebApp } from "@/lib/cloud/telegram";
import { waitForTelegramInitData } from "@/lib/cloud/wait-telegram-init";
import { t } from "@/lib/i18n";
import { buildReferralLinkFromCode } from "@/lib/referrals/client-link";
import { shareReferralLink } from "@/lib/referrals/share-link";
import { useToast } from "@/components/ui/toast";
import { ReferralWalletCard } from "@/components/ReferralWalletCard";
import type { ReferralProfilePublic } from "@/lib/referrals/service";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";

const referralShareBtnClass =
  "h-auto min-h-10 w-full shrink-0 whitespace-normal border-2 border-emerald-600/35 bg-gradient-to-br from-emerald-500/15 to-primary/10 px-3 py-2 text-center text-sm font-medium leading-snug text-emerald-950 shadow-none hover:from-emerald-500/25 hover:to-primary/15 dark:border-emerald-400/30 dark:from-emerald-950/80 dark:to-primary/20 dark:text-emerald-50 dark:hover:from-emerald-900/70 dark:hover:to-primary/25";

type ReferralPanelState = Partial<ReferralProfilePublic> & {
  ok?: boolean;
  enabled?: boolean;
  error?: string;
};

function mergeProfile(
  base: ReferralPanelState | null,
  patch: ReferralPanelState,
): ReferralPanelState {
  const code = patch.code ?? base?.code;
  const link = patch.link ?? (code ? buildReferralLinkFromCode(code) : base?.link);
  return { ...base, ...patch, code, link };
}

export function ReferralPanel() {
  const locale = useStore((s) => s.locale);
  const referralsOnServer = useCloudStore((s) => s.referralsEnabled);
  const cachedProfile = useCloudStore((s) => s.referralProfile);
  const { toast } = useToast();
  const tmaReady = useTelegramWebAppReady();
  const [profile, setProfile] = useState<ReferralPanelState | null>(() =>
    cachedProfile?.code
      ? mergeProfile(null, { ...cachedProfile, enabled: true })
      : null,
  );
  const [loading, setLoading] = useState(!cachedProfile?.code);
  const [copied, setCopied] = useState(false);
  const [inviteInput, setInviteInput] = useState("");
  const [applying, setApplying] = useState(false);

  const walletMode = Boolean(profile?.wallet?.enabled);

  const load = useCallback(async () => {
    if (hasTelegramWebApp()) {
      await waitForTelegramInitData(6000);
    }

    const auth = getCloudAuthBody();
    if (!auth.initData && !auth.telegramLogin) {
      setLoading(false);
      if (cachedProfile?.code) {
        setProfile(mergeProfile(null, { ...cachedProfile, enabled: true }));
        return;
      }
      setProfile({
        error: hasTelegramWebApp() ? "init_data_timeout" : "no_telegram_auth",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/referral/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(auth),
      });
      const data = (await res.json()) as ReferralPanelState & { error?: string };

      if (res.status === 401) {
        if (cachedProfile?.code) {
          setProfile(mergeProfile(null, { ...cachedProfile, enabled: true }));
          return;
        }
        setProfile({ error: "invalid_init_data" });
        return;
      }

      if (res.status === 503 && data.error === "referral_db_not_migrated") {
        setProfile({ enabled: true, error: "referral_db_not_migrated" });
        return;
      }

      if (!res.ok) {
        if (cachedProfile?.code) {
          setProfile(mergeProfile(null, { ...cachedProfile, enabled: true }));
          return;
        }
        setProfile({ error: data.error ?? "server_error" });
        return;
      }

      if (data.enabled === false) {
        setProfile({ enabled: false });
        return;
      }

      setProfile(mergeProfile(null, { ...data, enabled: true }));
      useCloudStore.getState().setReferralProfile(data as ReferralProfilePublic);
    } catch {
      if (cachedProfile?.code) {
        setProfile(mergeProfile(null, { ...cachedProfile, enabled: true }));
      } else {
        setProfile({ error: "network_error" });
      }
    } finally {
      setLoading(false);
    }
  }, [cachedProfile]);

  useEffect(() => {
    if (cachedProfile?.code) {
      setProfile(mergeProfile(null, { ...cachedProfile, enabled: true }));
      setLoading(false);
    }
  }, [cachedProfile]);

  useEffect(() => {
    if (!tmaReady && hasTelegramWebApp()) return;
    void load();
  }, [tmaReady, load]);

  const displayLink = useMemo(() => {
    if (profile?.link) return profile.link;
    if (profile?.code) return buildReferralLinkFromCode(profile.code);
    return null;
  }, [profile?.code, profile?.link]);

  const copyLink = async () => {
    if (!displayLink) return;
    try {
      await navigator.clipboard.writeText(displayLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast(t(locale, "referralCopied"), "success");
    } catch {
      toast(t(locale, "referralCopyFailed"), "error");
    }
  };

  const shareLink = () => {
    if (!displayLink) return;
    shareReferralLink(
      displayLink,
      walletMode
        ? t(locale, "referralShareWallet")
        : t(locale, "referralShareDays", {
            days: String(profile?.referrerBonusDays ?? 14),
          }),
    );
  };

  const applyInvite = async () => {
    if (hasTelegramWebApp()) await waitForTelegramInitData(4000);
    const auth = getCloudAuthBody();
    if (!hasCloudAuth()) return;
    const raw = inviteInput.trim();
    if (!raw) return;
    setApplying(true);
    try {
      const res = await fetch("/api/referral/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, code: raw }),
      });
      const data = (await res.json()) as ReferralPanelState & {
        apply?: { ok?: true; skipped?: string };
      };
      if (!res.ok) {
        if (data.error === "referral_db_not_migrated") {
          toast(t(locale, "referralDbNotMigrated"), "error");
        } else if (data.error === "invalid_code") {
          toast(t(locale, "referralApplyInvalid"), "error");
        } else {
          toast(t(locale, "referralApplyFailed"), "error");
        }
        return;
      }
      const skipped = data.apply?.skipped;
      if (skipped === "already_referred") {
        toast(t(locale, "referralApplyAlready"), "default");
      } else if (skipped === "self") {
        toast(t(locale, "referralApplySelf"), "error");
      } else if (skipped === "referrer_not_found" || skipped === "invalid_code") {
        toast(t(locale, "referralApplyInvalid"), "error");
      } else if (data.apply && "ok" in data.apply && data.apply.ok) {
        toast(t(locale, "referralApplyOk"), "success");
        setInviteInput("");
      }
      setProfile(mergeProfile(profile, { ...data, enabled: true }));
      await runHouseholdBootstrap();
    } catch {
      toast(t(locale, "referralApplyFailed"), "error");
    } finally {
      setApplying(false);
    }
  };

  if (!tmaReady && hasTelegramWebApp()) {
    return <p className="text-xs text-muted-foreground">{t(locale, "referralLoading")}</p>;
  }

  if (loading && !profile?.code) {
    return <p className="text-xs text-muted-foreground">{t(locale, "referralLoading")}</p>;
  }

  if (profile?.error === "referral_db_not_migrated") {
    return (
      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
        {t(locale, "referralDbNotMigrated")}
      </p>
    );
  }

  if (profile?.error === "invalid_init_data" || profile?.error === "init_data_timeout") {
    return (
      <p className="text-xs text-amber-800 dark:text-amber-100">
        {t(locale, "referralInvalidSession")}{" "}
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() => void load()}
        >
          {t(locale, "referralRetry")}
        </button>
      </p>
    );
  }

  if (profile?.error === "no_telegram_auth") {
    return <p className="text-xs text-muted-foreground">{t(locale, "referralOpenInTelegram")}</p>;
  }

  if (
    (profile?.error === "network_error" || profile?.error === "server_error") &&
    !profile?.code
  ) {
    return (
      <p className="text-xs text-muted-foreground">
        {t(locale, "referralLoadFailed")}{" "}
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() => void load()}
        >
          {t(locale, "referralRetry")}
        </button>
      </p>
    );
  }

  if (profile?.enabled === false || referralsOnServer === false) {
    return (
      <p className="text-xs text-muted-foreground">{t(locale, "referralDisabled")}</p>
    );
  }

  if (!profile?.code) {
    return (
      <p className="text-xs text-muted-foreground">
        {t(locale, "referralLoadFailed")}{" "}
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() => void load()}
        >
          {t(locale, "referralRetry")}
        </button>
      </p>
    );
  }

  const bonusDays = profile.referrerBonusDays ?? profile.referredBonusDays ?? 14;
  const walletPercent = String(profile.wallet?.commissionPercent ?? 10);
  const activityRequired = profile.activityDaysRequired ?? 0;
  const showApply = !profile.invitedByCode;

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground">
        {walletMode
          ? t(locale, "referralDesc", { percent: walletPercent })
          : t(locale, "referralDescDays", { days: String(bonusDays) })}
      </p>
      {activityRequired > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {t(locale, "referralActivityRule", { required: String(activityRequired) })}
        </p>
      ) : null}
      {profile.invitedByCode ? (
        <p className="text-xs text-muted-foreground">
          {t(locale, "referralInvitedBy", {
            code: profile.invitedByCode,
            name: profile.invitedByName ? ` (${profile.invitedByName})` : "",
          })}
        </p>
      ) : null}
      <div className="flex min-w-0 flex-col gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(referralShareBtnClass)}
          onClick={() => void copyLink()}
          disabled={!displayLink}
        >
          {copied ? t(locale, "referralCopied") : t(locale, "referralCopyLink")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(referralShareBtnClass)}
          onClick={shareLink}
          disabled={!displayLink}
        >
          {t(locale, "referralShare")}
        </Button>
      </div>
      <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {t(locale, "referralYourCode")}
        </p>
        <p className="font-mono text-sm font-semibold tracking-wider">{profile.code}</p>
      </div>
      {profile.wallet?.enabled ? (
        <ReferralWalletCard
          locale={locale}
          wallet={profile.wallet}
        />
      ) : null}
      {displayLink ? (
        <p className="break-all text-[10px] text-muted-foreground">{displayLink}</p>
      ) : null}
      <p className="text-sm font-medium tabular-nums text-muted-foreground">
        {t(locale, "referralCount", { count: String(profile.referralsCount ?? 0) })}
        {profile.referralsPending ? (
          <span className="ml-1 text-xs font-normal">
            · {t(locale, "referralPendingCount", { count: String(profile.referralsPending) })}
          </span>
        ) : null}
      </p>
      {showApply ? (
        <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-2.5">
          <p className="text-xs font-medium">{t(locale, "referralApplyTitle")}</p>
          <Input
            value={inviteInput}
            onChange={(e) => setInviteInput(e.target.value)}
            placeholder={t(locale, "referralApplyPlaceholder")}
          />
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={applying || !inviteInput.trim()}
            onClick={() => void applyInvite()}
          >
            {t(locale, "referralApplySubmit")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
