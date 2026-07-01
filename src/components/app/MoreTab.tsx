"use client";

import {
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { HelpFaqDialog } from "@/components/HelpFaqDialog";
import { ReferralPanel } from "@/components/ReferralPanel";
import { MoreServiceForm } from "@/components/app/MoreServiceForm";
import { Button } from "@/components/ui/button";
import { SettingsMenuRow } from "@/components/SettingsMenuRow";
import { requestOpenSettings } from "@/lib/billing/trial-banner";
import { t } from "@/lib/i18n";
import type { ServiceInquiryId } from "@/lib/services/inquiry-types";
import { useStore } from "@/store/useStore";

type MoreScreen =
  | "main"
  | "services"
  | "referral"
  | "osago"
  | "iszh_nszh"
  | "insurance_other";

export function MoreTab() {
  const locale = useStore((s) => s.locale);
  const [screen, setScreen] = useState<MoreScreen>("main");

  const serviceForm = (titleKey: "moreOsago" | "moreIszhNszh" | "moreInsuranceOther", serviceId: ServiceInquiryId, subtitleKey: "moreOsagoFormHint" | "moreIszhNszhFormHint" | "moreServiceFormHint", options?: ServiceInquiryId[]) => (
    <MoreServiceForm
      title={t(locale, titleKey)}
      subtitle={t(locale, subtitleKey)}
      serviceId={serviceId}
      showTopicPicker={Boolean(options)}
      topicOptions={options}
    />
  );

  if (screen === "services") {
    return (
      <div className="space-y-4 py-1">
        <MoreSubheader locale={locale} title={t(locale, "moreServicesTitle")} onBack={() => setScreen("main")} />

        <div className="space-y-2">
          <SettingsMenuRow
            title={t(locale, "moreOsago")}
            description={t(locale, "moreOsagoHint")}
            onClick={() => setScreen("osago")}
          />
          <SettingsMenuRow
            title={t(locale, "moreIszhNszh")}
            description={t(locale, "moreIszhNszhHint")}
            onClick={() => setScreen("iszh_nszh")}
          />
          <SettingsMenuRow
            title={t(locale, "moreInsuranceOther")}
            description={t(locale, "moreInsuranceOtherHint")}
            onClick={() => setScreen("insurance_other")}
          />
        </div>
      </div>
    );
  }

  if (screen === "osago") {
    return (
      <div className="space-y-4 py-1">
        <MoreSubheader locale={locale} title={t(locale, "moreOsago")} onBack={() => setScreen("services")} />
        {serviceForm("moreOsago", "osago", "moreOsagoFormHint")}
      </div>
    );
  }

  if (screen === "iszh_nszh") {
    return (
      <div className="space-y-4 py-1">
        <MoreSubheader locale={locale} title={t(locale, "moreIszhNszh")} onBack={() => setScreen("services")} />
        {serviceForm("moreIszhNszh", "iszh", "moreIszhNszhFormHint", ["iszh", "nszh"])}
      </div>
    );
  }

  if (screen === "insurance_other") {
    return (
      <div className="space-y-4 py-1">
        <MoreSubheader locale={locale} title={t(locale, "moreInsuranceOther")} onBack={() => setScreen("services")} />
        {serviceForm("moreInsuranceOther", "tick", "moreServiceFormHint")}
      </div>
    );
  }

  if (screen === "referral") {
    return (
      <div className="space-y-4 py-1">
        <MoreSubheader locale={locale} title={t(locale, "moreReferralTitle")} onBack={() => setScreen("main")} />
        <ReferralPanel />
      </div>
    );
  }

  return (
    <div className="space-y-5 py-1">
      <div>
        <h2 className="text-lg font-bold">{t(locale, "moreTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t(locale, "moreSubtitle")}</p>
      </div>

      <div className="space-y-2">
        <MoreHubPlaque
          title={t(locale, "moreServicesTitle")}
          hint={t(locale, "moreInsuranceMenuHint")}
          icon={<ShieldCheck className="h-4 w-4 text-primary" aria-hidden />}
          onClick={() => setScreen("services")}
        />
        <MoreHubPlaque
          title={t(locale, "moreReferralTitle")}
          hint={t(locale, "moreReferralHint")}
          icon={<UsersRound className="h-4 w-4 text-primary" aria-hidden />}
          onClick={() => setScreen("referral")}
        />
      </div>

      <div className="h-px w-full bg-border/70" aria-hidden />

      <div className="space-y-2">
        <SettingsMenuRow
          title={t(locale, "moreSettings")}
          description={t(locale, "moreSettingsHint")}
          onClick={() => requestOpenSettings()}
        />
        <HelpFaqDialog locale={locale} variant="settings" />
      </div>
    </div>
  );
}

function MoreHubPlaque({
  title,
  hint,
  icon,
  onClick,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border-2 border-border/80 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        {icon}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

function MoreSubheader({
  locale,
  title,
  onBack,
}: {
  locale: "ru" | "en";
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label={t(locale, "settingsBack")}
        onClick={onBack}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <h2 className="text-lg font-bold leading-tight">{title}</h2>
    </div>
  );
}
