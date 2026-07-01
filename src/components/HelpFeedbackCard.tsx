"use client";

import { MessageSquareText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { getCloudAuthBody } from "@/lib/cloud/auth-payload";
import { t } from "@/lib/i18n";
import type { Locale } from "@/types";

type FeedbackKind = "idea" | "issue" | "thanks";

const KINDS: FeedbackKind[] = ["idea", "issue", "thanks"];

export function HelpFeedbackCard({ locale }: { locale: Locale }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const text = message.trim();
    if (text.length < 3) {
      toast(t(locale, "helpFeedbackRequired"), "error");
      return;
    }
    const auth = getCloudAuthBody();
    if (!auth.initData && !auth.telegramLogin) {
      toast(t(locale, "moreServiceFormTelegramOnly"), "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/help-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, kind, message: text }),
      });
      if (!res.ok) throw new Error("feedback_failed");
      setSent(true);
      setMessage("");
      toast(t(locale, "helpFeedbackDone"), "success");
    } catch {
      toast(t(locale, "helpFeedbackFail"), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-md border border-primary/25 bg-primary/5 p-3">
      <div className="flex items-start gap-2">
        <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t(locale, "helpFeedbackTitle")}</p>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {t(locale, "helpFeedbackHint")}
          </p>
        </div>
      </div>

      {sent && !open ? (
        <p className="mt-3 rounded-md bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-950 dark:text-emerald-50">
          {t(locale, "helpFeedbackDone")}
        </p>
      ) : null}

      {!open ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => {
            setOpen(true);
            setSent(false);
          }}
        >
          {t(locale, "helpFeedbackOpen")}
        </Button>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-3 gap-1.5">
            {KINDS.map((id) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={kind === id ? "default" : "outline"}
                className="h-auto min-h-8 whitespace-normal px-2 py-1 text-[11px]"
                onClick={() => setKind(id)}
              >
                {t(locale, `helpFeedbackKind_${id}`)}
              </Button>
            ))}
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t(locale, "helpFeedbackPlaceholder")}
            rows={4}
            maxLength={2000}
            className="min-h-[6rem] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            disabled={loading}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              className="flex-1"
              disabled={loading}
              onClick={() => void submit()}
            >
              {loading ? t(locale, "moreServiceFormSending") : t(locale, "helpFeedbackSubmit")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => setOpen(false)}
            >
              {t(locale, "helpFeedbackCancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
