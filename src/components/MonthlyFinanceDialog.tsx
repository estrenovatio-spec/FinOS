"use client";

import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAdvisorConfig } from "@/lib/advisor-config";
import { formatIsoDate } from "@/lib/format-date";
import { getCategoryLabel } from "@/lib/categories";
import { formatDaysLabel, t } from "@/lib/i18n";
import {
  MONTHLY_CHAT_MAX_USER_MESSAGES,
  buildChatSummaryForQuestion,
  buildMonthlySummary,
  getMonthlyGate,
  getMonthlyWaitingMessages,
  ruleBasedMonthlyAnalysis,
} from "@/lib/monthly-analysis";
import {
  getCachedMonthlyAnalysis,
  getMonthlyChatMessages,
  MONTHLY_ANALYSIS_TTL_MS,
  setCachedMonthlyAnalysis,
  setMonthlyChatMessages,
  type MonthlyChatMessage,
} from "@/lib/storage";
import { MONTHLY_ANALYSIS_HIDDEN_KEY } from "@/lib/storage-reset";
import { useCategories, useStore, useTransactions } from "@/store/useStore";

const AUTO_OPEN_KEY = "voicebudget-monthly-auto-open-v1";

function readHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MONTHLY_ANALYSIS_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(MONTHLY_ANALYSIS_HIDDEN_KEY, "1");
    else localStorage.removeItem(MONTHLY_ANALYSIS_HIDDEN_KEY);
  } catch {
    /* ignore */
  }
}

function daysUntilNext(msRemaining: number): number {
  return Math.max(1, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
}

function wasAutoOpenedForPeriod(periodEnd: string): boolean {
  try {
    return localStorage.getItem(`${AUTO_OPEN_KEY}-${periodEnd}`) === "1";
  } catch {
    return false;
  }
}

function markAutoOpenedForPeriod(periodEnd: string): void {
  try {
    localStorage.setItem(`${AUTO_OPEN_KEY}-${periodEnd}`, "1");
  } catch {
    /* ignore */
  }
}

export function MonthlyFinanceDialog() {
  const locale = useStore((s) => s.locale);
  const trackingStartedAt = useStore((s) => s.trackingStartedAt);
  const transactions = useTransactions();
  const categories = useCategories();

  const [hidden, setHidden] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [report, setReport] = useState<string[]>([]);
  const [chat, setChat] = useState<MonthlyChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [nextInDays, setNextInDays] = useState<number | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [isFullReport, setIsFullReport] = useState(false);
  const [chatLimitHit, setChatLimitHit] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const summary = useMemo(
    () =>
      buildMonthlySummary(transactions, trackingStartedAt, (id) =>
        getCategoryLabel(id, categories, locale),
      ),
    [categories, locale, transactions, trackingStartedAt],
  );

  const gate = useMemo(
    () => getMonthlyGate(summary, trackingStartedAt, transactions),
    [summary, trackingStartedAt, transactions],
  );

  const userMessageCount = chat.filter((m) => m.role === "user").length;
  const canAsk =
    gate.ready &&
    isFullReport &&
    report.length > 0 &&
    userMessageCount < MONTHLY_CHAT_MAX_USER_MESSAGES &&
    !chatLimitHit;

  const loadReport = useCallback(
    async (force = false): Promise<{ tips: string[]; isNew: boolean } | null> => {
      if (!gate.ready) {
        setReport(getMonthlyWaitingMessages(gate, locale, summary));
        setNextInDays(null);
        setIsFullReport(false);
        setUsedFallback(false);
        return null;
      }

      if (!force) {
        const cached = getCachedMonthlyAnalysis();
        if (cached) {
          setReport(cached.items);
          setIsFullReport(true);
          setChat(getMonthlyChatMessages());
          setNextInDays(
            daysUntilNext(MONTHLY_ANALYSIS_TTL_MS - (Date.now() - cached.generatedAt)),
          );
          return { tips: cached.items, isNew: false };
        }
      }

      setLoadingReport(true);
      setUsedFallback(false);
      try {
        const res = await fetch("/api/monthly-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale, summary }),
        });

        const json = (await res.json()) as {
          success?: boolean;
          tips?: string[];
          fallback?: boolean;
        };

        if (!res.ok || !json.success || !json.tips?.length) {
          const waiting = getMonthlyWaitingMessages(gate, locale, summary);
          setReport(waiting);
          setIsFullReport(false);
          setNextInDays(null);
          return null;
        }

        setReport(json.tips);
        setCachedMonthlyAnalysis(json.tips, summary.periodEnd);
        setChat([]);
        setNextInDays(30);
        setIsFullReport(true);
        setUsedFallback(Boolean(json.fallback));
        setChatLimitHit(false);
        return { tips: json.tips, isNew: true };
      } catch {
        const tips = ruleBasedMonthlyAnalysis(summary, locale, getAdvisorConfig());
        setReport(tips);
        setCachedMonthlyAnalysis(tips, summary.periodEnd);
        setChat([]);
        setNextInDays(30);
        setIsFullReport(true);
        setUsedFallback(true);
        return { tips, isNew: true };
      } finally {
        setLoadingReport(false);
      }
    },
    [gate, locale, summary],
  );

  useEffect(() => {
    setHidden(readHidden());
    setChat(getMonthlyChatMessages());
  }, []);

  useEffect(() => {
    if (hidden) return;
    void (async () => {
      const result = await loadReport(false);
      if (
        result?.isNew &&
        gate.ready &&
        !wasAutoOpenedForPeriod(summary.periodEnd)
      ) {
        setDialogOpen(true);
        markAutoOpenedForPeriod(summary.periodEnd);
      }
    })();
  }, [hidden, loadReport, gate.ready, summary.periodEnd]);

  useEffect(() => {
    if (dialogOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [dialogOpen, chat, loadingChat]);

  const openDialog = useCallback(async () => {
    setDialogOpen(true);
    if (report.length === 0 || !isFullReport) {
      await loadReport(false);
    }
  }, [isFullReport, loadReport, report.length]);

  const sendQuestion = useCallback(async () => {
    const q = question.trim();
    if (!q || !canAsk || loadingChat) return;

    const userMsg: MonthlyChatMessage = { role: "user", content: q };
    const nextChat = [...chat, userMsg];
    setChat(nextChat);
    setQuestion("");
    setLoadingChat(true);

    try {
      const chatSummary = buildChatSummaryForQuestion(
        q,
        summary,
        transactions,
        trackingStartedAt,
        (id) => getCategoryLabel(id, categories, locale),
      );

      const res = await fetch("/api/monthly-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          summary: chatSummary,
          reportTips: report,
          messages: chat,
          question: q,
        }),
      });

      const json = (await res.json()) as {
        success?: boolean;
        reply?: string;
        error?: string;
      };

      if (res.status === 429 || json.error === "chat_limit") {
        setChatLimitHit(true);
        return;
      }

      const reply =
        json.reply ??
        (locale === "ru"
          ? "Не удалось получить ответ. Попробуйте переформулировать вопрос."
          : "Could not get an answer. Try rephrasing your question.");

      const withReply: MonthlyChatMessage[] = [...nextChat, { role: "assistant", content: reply }];
      setChat(withReply);
      setMonthlyChatMessages(withReply);
    } catch {
      const errMsg =
        locale === "ru"
          ? "Ошибка сети. Проверьте интернет и попробуйте снова."
          : "Network error. Check your connection and try again.";
      const withReply: MonthlyChatMessage[] = [...nextChat, { role: "assistant", content: errMsg }];
      setChat(withReply);
      setMonthlyChatMessages(withReply);
    } finally {
      setLoadingChat(false);
    }
  }, [
    canAsk,
    categories,
    chat,
    loadingChat,
    locale,
    question,
    report,
    summary,
    trackingStartedAt,
    transactions,
  ]);

  const show = useCallback(() => {
    setHidden(false);
    writeHidden(false);
  }, []);

  const hide = useCallback(() => {
    setHidden(true);
    writeHidden(true);
  }, []);

  if (hidden) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/25 px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <MessageSquare className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{t(locale, "monthlyTitle")}</span>
        </span>
        <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1" onClick={show}>
          <ChevronDown className="h-4 w-4" />
          {t(locale, "monthlyShow")}
        </Button>
      </div>
    );
  }

  return (
    <>
      <Card className="border-primary/25">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 shrink-0 text-primary" />
              {t(locale, "monthlyTitle")}
            </CardTitle>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              {gate.ready
                ? t(locale, "monthlyPeriod", {
                    from: formatIsoDate(summary.periodStart, locale),
                    to: formatIsoDate(summary.periodEnd, locale),
                  })
                : t(locale, "monthlySubtitleWaiting")}
            </p>
            {nextInDays !== null && isFullReport && (
              <p className="text-xs text-muted-foreground">
                {t(locale, "monthlyNextIn", {
                  daysLabel: formatDaysLabel(nextInDays, locale),
                })}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1 px-2 text-xs"
            onClick={hide}
          >
            <ChevronUp className="h-4 w-4" />
            {t(locale, "monthlyHide")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingReport && report.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t(locale, "monthlyLoading")}
            </p>
          ) : (
            <>
              {!gate.ready && (
                <p className="text-xs text-muted-foreground">{t(locale, "monthlyNoRush")}</p>
              )}
              {gate.ready && (
                <Button
                  type="button"
                  className="w-full gap-2"
                  onClick={() => void openDialog()}
                  disabled={loadingReport}
                >
                  {loadingReport ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {t(locale, "monthlyOpenDialog")}
                </Button>
              )}
              {!gate.ready && report.length > 0 && (
                <ul className="space-y-2 text-sm">
                  {report.map((item, i) => (
                    <li
                      key={`${i}-${item.slice(0, 24)}`}
                      className="rounded-md border border-dashed border-muted-foreground/30 p-2 leading-snug text-muted-foreground"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[min(90vh,var(--tg-viewport-height,90vh))] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-4 pr-10">
            <DialogTitle className="flex items-center gap-2 text-left text-base">
              <MessageSquare className="h-4 w-4 text-primary" />
              {t(locale, "monthlyTitle")}
            </DialogTitle>
            <p className="text-left text-xs text-muted-foreground">
              {t(locale, "monthlyPeriod", {
                from: formatIsoDate(summary.periodStart, locale),
                to: formatIsoDate(summary.periodEnd, locale),
              })}
            </p>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {t(locale, "monthlyReportSection")}
            </p>
            {usedFallback && isFullReport && (
              <p className="mb-2 text-xs text-muted-foreground">{t(locale, "monthlyFallback")}</p>
            )}
            {loadingReport && report.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t(locale, "monthlyLoading")}
              </p>
            ) : (
              <ul className="mb-4 space-y-2 text-sm">
                {report.map((item, i) => (
                  <li key={`r-${i}-${item.slice(0, 20)}`} className="rounded-md bg-primary/5 p-2.5 leading-snug">
                    {item}
                  </li>
                ))}
              </ul>
            )}

            <p className="mb-2 text-xs text-muted-foreground">{t(locale, "monthlyChatHint")}</p>

            <div className="space-y-2">
              {chat.length === 0 && !loadingChat && (
                <p className="text-xs text-muted-foreground">{t(locale, "monthlyChatEmpty")}</p>
              )}
              {chat.map((msg, i) => (
                <div
                  key={`${i}-${msg.role}`}
                  className={
                    msg.role === "user"
                      ? "ml-4 rounded-lg bg-primary/10 p-2.5 text-sm leading-snug"
                      : "mr-2 rounded-lg bg-secondary/80 p-2.5 text-sm leading-snug"
                  }
                >
                  {msg.content}
                </div>
              ))}
              {loadingChat && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t(locale, "monthlyChatThinking")}
                </p>
              )}
              <div ref={chatEndRef} />
            </div>

            {(chatLimitHit || userMessageCount >= MONTHLY_CHAT_MAX_USER_MESSAGES) && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                {t(locale, "monthlyChatLimit", {
                  daysLabel: formatDaysLabel(nextInDays ?? 30, locale),
                })}
              </p>
            )}
          </div>

          <div className="shrink-0 border-t bg-background p-3">
            <div className="flex gap-2">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendQuestion();
                  }
                }}
                placeholder={t(locale, "monthlyChatPlaceholder")}
                disabled={!canAsk || loadingChat}
                rows={2}
                className="min-h-[2.5rem] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
              <Button
                type="button"
                size="icon"
                className="h-10 w-10 shrink-0"
                disabled={!canAsk || loadingChat || !question.trim()}
                onClick={() => void sendQuestion()}
                aria-label={t(locale, "monthlyChatSend")}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
              {t(locale, "monthlyChatSend")} · {userMessageCount}/{MONTHLY_CHAT_MAX_USER_MESSAGES}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
