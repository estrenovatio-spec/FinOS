"use client";

import { CalendarDays, Loader2, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getAdvisorConfig } from "@/lib/advisor-config";
import { formatIsoDate } from "@/lib/format-date";
import { getCategoryLabel } from "@/lib/categories";
import { formatDaysLabel, t } from "@/lib/i18n";
import { buildAiCoachingContext } from "@/lib/ai-coaching-context";
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
import { persistAiReportToCloud } from "@/lib/reports/persist-ai-report";
import { useCategories, useStore, useTransactions } from "@/store/useStore";

function daysUntilNext(msRemaining: number): number {
  return Math.max(1, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
}

type MonthlyAnalysisTabProps = {
  active: boolean;
};

export function MonthlyAnalysisTab({ active }: MonthlyAnalysisTabProps) {
  const locale = useStore((s) => s.locale);
  const trackingStartedAt = useStore((s) => s.trackingStartedAt);
  const transactions = useTransactions();
  const categories = useCategories();
  const savingsGoals = useStore((s) => s.savingsGoals);
  const categoryBudgets = useStore((s) => s.categoryBudgets);

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

  const coaching = useMemo(
    () =>
      buildAiCoachingContext(
        transactions,
        savingsGoals,
        categoryBudgets,
        (id) => getCategoryLabel(id, categories, locale),
        summary.periodStart,
        summary.periodEnd,
        categories,
        locale,
      ),
    [
      transactions,
      savingsGoals,
      categoryBudgets,
      categories,
      locale,
      summary.periodStart,
      summary.periodEnd,
    ],
  );

  const coachingPayload = useMemo(
    () =>
      coaching.savingsGoals.length > 0 || coaching.categoryBudgets.length > 0
        ? coaching
        : undefined,
    [coaching],
  );

  const userMessageCount = chat.filter((m) => m.role === "user").length;
  const canAsk =
    gate.ready &&
    isFullReport &&
    report.length > 0 &&
    userMessageCount < MONTHLY_CHAT_MAX_USER_MESSAGES &&
    !chatLimitHit;

  const loadReport = useCallback(
    async (force = false) => {
      if (!gate.ready) {
        setReport(getMonthlyWaitingMessages(gate, locale, summary));
        setNextInDays(null);
        setIsFullReport(false);
        setUsedFallback(false);
        setChat([]);
        return;
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
          return;
        }
      }

      setLoadingReport(true);
      setUsedFallback(false);
      try {
        const res = await fetch("/api/monthly-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale, summary, coaching: coachingPayload }),
        });

        const json = (await res.json()) as {
          success?: boolean;
          tips?: string[];
          fallback?: boolean;
        };

        if (!res.ok || !json.success || !json.tips?.length) {
          setReport(getMonthlyWaitingMessages(gate, locale, summary));
          setIsFullReport(false);
          setNextInDays(null);
          return;
        }

        setReport(json.tips);
        setCachedMonthlyAnalysis(json.tips, summary.periodEnd);
        setChat([]);
        setMonthlyChatMessages([]);
        setNextInDays(30);
        setIsFullReport(true);
        setUsedFallback(Boolean(json.fallback));
        setChatLimitHit(false);
        void persistAiReportToCloud({
          kind: "monthly",
          periodStart: summary.periodStart,
          periodEnd: summary.periodEnd,
          locale,
          tips: json.tips,
          fallback: json.fallback,
          summaryJson: summary,
        });
      } catch {
        const tips = ruleBasedMonthlyAnalysis(summary, locale, getAdvisorConfig());
        setReport(tips);
        setCachedMonthlyAnalysis(tips, summary.periodEnd);
        setChat([]);
        setMonthlyChatMessages([]);
        setNextInDays(30);
        setIsFullReport(true);
        setUsedFallback(true);
        void persistAiReportToCloud({
          kind: "monthly",
          periodStart: summary.periodStart,
          periodEnd: summary.periodEnd,
          locale,
          tips,
          fallback: true,
          summaryJson: summary,
        });
      } finally {
        setLoadingReport(false);
      }
    },
    [coachingPayload, gate, locale, summary],
  );

  useEffect(() => {
    setChat(getMonthlyChatMessages());
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadReport(false);
  }, [active, loadReport]);

  useEffect(() => {
    if (active) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [active, chat, loadingChat]);

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
            coaching: coachingPayload,
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
    coachingPayload,
    summary,
    trackingStartedAt,
    transactions,
  ]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDays className="h-3 w-3 shrink-0" />
          {gate.ready
            ? t(locale, "monthlyPeriod", {
                from: formatIsoDate(summary.periodStart, locale),
                to: formatIsoDate(summary.periodEnd, locale),
              })
            : t(locale, "monthlySubtitleWaiting")}
        </p>
        {gate.ready && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={loadingReport}
            onClick={() => void loadReport(true)}
          >
            {t(locale, "weeklyRefresh")}
          </Button>
        )}
      </div>
      {nextInDays !== null && isFullReport && (
        <p className="text-xs text-muted-foreground">
          {t(locale, "monthlyNextIn", { daysLabel: formatDaysLabel(nextInDays, locale) })}
        </p>
      )}
      {loadingReport && report.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t(locale, "monthlyLoading")}
        </p>
      ) : (
        <>
          {usedFallback && isFullReport && (
            <p className="text-xs text-muted-foreground">{t(locale, "monthlyFallback")}</p>
          )}
          {!gate.ready && (
            <p className="text-xs text-muted-foreground">{t(locale, "monthlyNoRush")}</p>
          )}
          <ul className="space-y-2 text-sm">
            {report.map((item, i) => (
              <li
                key={`${i}-${item.slice(0, 24)}`}
                className={
                  isFullReport
                    ? "rounded-md bg-primary/5 p-2.5 leading-snug text-foreground/90"
                    : "rounded-md border border-dashed border-muted-foreground/30 p-2.5 leading-snug text-muted-foreground"
                }
              >
                {item}
              </li>
            ))}
          </ul>
        </>
      )}

      {gate.ready && isFullReport && report.length > 0 && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">{t(locale, "monthlyChatHint")}</p>
          <div className="max-h-48 space-y-2 overflow-y-auto overscroll-contain">
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
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t(locale, "monthlyChatLimit", {
                daysLabel: formatDaysLabel(nextInDays ?? 30, locale),
              })}
            </p>
          )}
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
          <p className="text-center text-[10px] text-muted-foreground">
            {userMessageCount}/{MONTHLY_CHAT_MAX_USER_MESSAGES}
          </p>
        </div>
      )}
    </div>
  );
}
