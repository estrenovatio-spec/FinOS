"use client";

import { CalendarDays, Loader2, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { getAdvisorConfig } from "@/lib/advisor-config";
import { formatIsoDate } from "@/lib/format-date";
import { getCategoryLabel } from "@/lib/categories";
import { formatDaysLabel, t } from "@/lib/i18n";
import { buildAiCoachingContext } from "@/lib/ai-coaching-context";
import {
  getCachedWeeklyAnalysis,
  getWeeklyChatMessages,
  setWeeklyChatMessages,
  setCachedWeeklyAnalysis,
  WEEKLY_ANALYSIS_TTL_MS,
  type WeeklyChatMessage,
} from "@/lib/storage";
import {
  buildWeeklySummary,
  getWeeklyGate,
  getWeeklyWaitingMessages,
  ruleBasedWeeklyAnalysis,
  WEEKLY_CHAT_MAX_USER_MESSAGES,
  weeklyAdvisorQuestions,
} from "@/lib/weekly-analysis";
import { persistAiReportToCloud } from "@/lib/reports/persist-ai-report";
import { useCategories, useStore, useTransactions } from "@/store/useStore";

function daysUntilNext(msRemaining: number): number {
  return Math.max(1, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
}

type WeeklyAnalysisTabProps = {
  active: boolean;
};

export function WeeklyAnalysisTab({ active }: WeeklyAnalysisTabProps) {
  const locale = useStore((s) => s.locale);
  const trackingStartedAt = useStore((s) => s.trackingStartedAt);
  const transactions = useTransactions();
  const categories = useCategories();
  const savingsGoals = useStore((s) => s.savingsGoals);
  const categoryBudgets = useStore((s) => s.categoryBudgets);

  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextInDays, setNextInDays] = useState<number | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [isFullAnalysis, setIsFullAnalysis] = useState(false);
  const [chat, setChat] = useState<WeeklyChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loadingChat, setLoadingChat] = useState(false);
  const [chatLimitHit, setChatLimitHit] = useState(false);

  const summary = useMemo(
    () =>
      buildWeeklySummary(transactions, trackingStartedAt, (id) =>
        getCategoryLabel(id, categories, locale),
      ),
    [categories, locale, transactions, trackingStartedAt],
  );

  const gate = useMemo(
    () => getWeeklyGate(summary, trackingStartedAt, transactions),
    [summary, trackingStartedAt, transactions],
  );

  const advisorQuestions = useMemo(
    () => weeklyAdvisorQuestions(summary, locale),
    [locale, summary],
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
    isFullAnalysis &&
    items.length > 0 &&
    userMessageCount < WEEKLY_CHAT_MAX_USER_MESSAGES &&
    !chatLimitHit;

  const loadAnalysis = useCallback(
    async () => {
      if (!gate.ready) {
        setItems(getWeeklyWaitingMessages(gate, locale, summary));
        setNextInDays(null);
        setIsFullAnalysis(false);
        setUsedFallback(false);
        setChat([]);
        return;
      }

      const cached = getCachedWeeklyAnalysis();
      if (cached) {
        setItems(cached.items);
        setIsFullAnalysis(true);
        setChat(getWeeklyChatMessages());
        setNextInDays(
          daysUntilNext(WEEKLY_ANALYSIS_TTL_MS - (Date.now() - cached.generatedAt)),
        );
        return;
      }

      setLoading(true);
      setUsedFallback(false);
      try {
        const res = await fetch("/api/weekly-analysis", {
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
          setItems(getWeeklyWaitingMessages(gate, locale, summary));
          setIsFullAnalysis(false);
          setNextInDays(null);
          return;
        }

        setItems(json.tips);
        setCachedWeeklyAnalysis(json.tips, summary.periodEnd);
        setChat([]);
        setWeeklyChatMessages([]);
        setNextInDays(7);
        setIsFullAnalysis(true);
        setUsedFallback(Boolean(json.fallback));
        setChatLimitHit(false);
        void persistAiReportToCloud({
          kind: "weekly",
          periodStart: summary.periodStart,
          periodEnd: summary.periodEnd,
          locale,
          tips: json.tips,
          fallback: json.fallback,
          summaryJson: summary,
        });
      } catch {
        const tips = ruleBasedWeeklyAnalysis(summary, locale, getAdvisorConfig());
        setItems(tips);
        setCachedWeeklyAnalysis(tips, summary.periodEnd);
        setChat([]);
        setWeeklyChatMessages([]);
        setNextInDays(7);
        setIsFullAnalysis(true);
        setUsedFallback(true);
        void persistAiReportToCloud({
          kind: "weekly",
          periodStart: summary.periodStart,
          periodEnd: summary.periodEnd,
          locale,
          tips,
          fallback: true,
          summaryJson: summary,
        });
      } finally {
        setLoading(false);
      }
    },
    [coachingPayload, gate, locale, summary],
  );

  useEffect(() => {
    setChat(getWeeklyChatMessages());
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadAnalysis();
  }, [active, loadAnalysis]);

  const sendQuestion = useCallback(
    async (nextQuestion?: string) => {
      const q = (nextQuestion ?? question).trim();
      if (!q || !canAsk || loadingChat) return;

      const userMsg: WeeklyChatMessage = { role: "user", content: q };
      const nextChat = [...chat, userMsg];
      setChat(nextChat);
      if (!nextQuestion) setQuestion("");
      setLoadingChat(true);

      try {
        const res = await fetch("/api/weekly-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locale,
            summary,
            reportTips: items,
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

        const withReply: WeeklyChatMessage[] = [
          ...nextChat,
          { role: "assistant", content: reply },
        ];
        setChat(withReply);
        setWeeklyChatMessages(withReply);
      } catch {
        const errMsg =
          locale === "ru"
            ? "Ошибка сети. Проверьте интернет и попробуйте снова."
            : "Network error. Check your connection and try again.";
        const withReply: WeeklyChatMessage[] = [
          ...nextChat,
          { role: "assistant", content: errMsg },
        ];
        setChat(withReply);
        setWeeklyChatMessages(withReply);
      } finally {
        setLoadingChat(false);
      }
    },
    [canAsk, chat, coachingPayload, items, loadingChat, locale, question, summary],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDays className="h-3 w-3 shrink-0" />
          {gate.ready
            ? t(locale, "weeklyPeriod", {
                from: formatIsoDate(summary.periodStart, locale),
                to: formatIsoDate(summary.periodEnd, locale),
              })
            : t(locale, "weeklySubtitleWaiting")}
        </p>
      </div>
      {nextInDays !== null && isFullAnalysis && (
        <p className="text-xs text-muted-foreground">
          {t(locale, "weeklyNextIn", { daysLabel: formatDaysLabel(nextInDays, locale) })}
        </p>
      )}
      {loading && items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t(locale, "weeklyLoading")}
        </p>
      ) : (
        <>
          {usedFallback && isFullAnalysis && (
            <p className="text-xs text-muted-foreground">{t(locale, "weeklyFallback")}</p>
          )}
          {!gate.ready && (
            <p className="text-xs text-muted-foreground">{t(locale, "weeklyNoRush")}</p>
          )}
          <ul className="space-y-2 text-sm">
            {items.map((item, i) => (
              <li
                key={`${i}-${item.slice(0, 24)}`}
                className={
                  isFullAnalysis
                    ? "rounded-md bg-primary/5 p-2.5 leading-snug text-foreground/90"
                    : "rounded-md border border-dashed border-muted-foreground/30 p-2.5 leading-snug text-muted-foreground"
                }
              >
                {item}
              </li>
            ))}
          </ul>
          {isFullAnalysis ? (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-semibold text-foreground">
                {locale === "ru" ? "Финсоветник по неделе" : "Weekly advisor"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {advisorQuestions.map((question) => (
                  <Button
                    key={question}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-8 whitespace-normal px-2 py-1.5 text-left text-xs leading-snug"
                    disabled={!canAsk || loadingChat}
                    onClick={() => void sendQuestion(question)}
                  >
                    {question}
                  </Button>
                ))}
              </div>
              <div className="max-h-48 space-y-2 overflow-y-auto overscroll-contain">
                {chat.length === 0 && !loadingChat && (
                  <p className="text-xs text-muted-foreground">
                    {locale === "ru"
                      ? "Выберите готовый вопрос или задайте свой по этим расходам."
                      : "Choose a suggested question or ask your own about these expenses."}
                  </p>
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
                    {locale === "ru" ? "Финсоветник думает..." : "Advisor is thinking..."}
                  </p>
                )}
              </div>
              {(chatLimitHit || userMessageCount >= WEEKLY_CHAT_MAX_USER_MESSAGES) && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {locale === "ru"
                    ? "На этот недельный разбор уже использованы 3 вопроса. Следующий лимит откроется с новым недельным разбором."
                    : "You used 3 questions for this weekly review. The next limit opens with a new weekly review."}
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
                  placeholder={
                    locale === "ru"
                      ? "Спросить по своим финансам..."
                      : "Ask about your finances..."
                  }
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
                  aria-label={locale === "ru" ? "Отправить вопрос" : "Send question"}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-center text-[10px] text-muted-foreground">
                {userMessageCount}/{WEEKLY_CHAT_MAX_USER_MESSAGES}
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
