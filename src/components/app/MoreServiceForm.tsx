"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCloudAuthBody } from "@/lib/cloud/auth-payload";
import { openExternalAppLink } from "@/lib/education-links";
import { t } from "@/lib/i18n";
import type { ServiceInquiryId } from "@/lib/services/inquiry-types";
import { serviceInquiryTopicLabel } from "@/lib/services/inquiry-types";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/useStore";

const OTHER_TOPICS: ServiceInquiryId[] = ["tick", "mortgage", "travel"];

export function MoreServiceForm({
  title,
  subtitle,
  serviceId,
  showTopicPicker = false,
  topicOptions,
  externalFormUrl,
}: {
  title: string;
  subtitle?: string;
  serviceId: ServiceInquiryId;
  showTopicPicker?: boolean;
  topicOptions?: ServiceInquiryId[];
  externalFormUrl?: string | null;
}) {
  const locale = useStore((s) => s.locale);
  const { toast } = useToast();
  const topics = topicOptions ?? OTHER_TOPICS;
  const [topic, setTopic] = useState<ServiceInquiryId>(
    showTopicPicker ? topics[0] : serviceId,
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const activeServiceId = showTopicPicker ? topic : serviceId;

  const submit = async () => {
    const n = name.trim();
    const p = phone.trim();
    if (!n || !p) {
      toast(t(locale, "moreServiceFormRequired"), "error");
      return;
    }

    const auth = getCloudAuthBody();
    if (!auth.initData && !auth.telegramLogin) {
      toast(t(locale, "moreServiceFormTelegramOnly"), "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/services/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...auth,
          serviceId: activeServiceId,
          name: n,
          phone: p,
        }),
      });
      if (!res.ok) throw new Error("submit_failed");
      setSent(true);
      toast(t(locale, "moreServiceFormDone"), "success");
    } catch {
      toast(t(locale, "moreServiceFormFail"), "error");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-4 text-sm text-emerald-950 dark:text-emerald-50">
        {t(locale, "moreServiceFormDone")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{title}</p>
      {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}

      {showTopicPicker ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {t(locale, "moreServiceTopic")}
          </p>
          <div className="flex flex-col gap-1.5">
            {topics.map((id) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={topic === id ? "default" : "outline"}
                className="h-auto min-h-8 justify-start whitespace-normal py-1.5 text-left text-xs"
                onClick={() => setTopic(id)}
              >
                {serviceInquiryTopicLabel(id, locale)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t(locale, "moreServiceFormName")}
        autoComplete="name"
      />
      <Input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder={t(locale, "moreServiceFormPhone")}
        inputMode="tel"
        autoComplete="tel"
      />
      <Button type="button" className="w-full" disabled={loading} onClick={() => void submit()}>
        {loading ? t(locale, "moreServiceFormSending") : t(locale, "moreServiceFormSubmit")}
      </Button>

      {externalFormUrl ? (
        <Button
          type="button"
          variant="outline"
          className="w-full text-xs"
          onClick={() => openExternalAppLink(externalFormUrl)}
        >
          {t(locale, "moreServiceOpenForm")}
        </Button>
      ) : null}
    </div>
  );
}
