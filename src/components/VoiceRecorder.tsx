"use client";

import { Loader2, Mic, Square } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { getCategoryLabel } from "@/lib/categories";
import { confirmExpectedPaymentFromInput } from "@/lib/expected-payment-actions";
import {
  buildMatcherState,
  buildSyntheticPaymentTransaction,
  matchInputToExpectedPayments,
  type ExpectedPaymentCandidate,
  type ExpectedPaymentMatchResult,
} from "@/lib/expected-payment-matcher";
import { resolveExpectedEventDisplayStatus } from "@/lib/expected-events";
import { formatTransactionDate, getLocalTodayIsoDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { t, ruPlural, enPlural } from "@/lib/i18n";
import { inferParseLocale } from "@/lib/locale-infer";
import {
  extractCompactMultiAmountInput,
  extractSeparatedMoneyAmounts,
} from "@/lib/multiple-amounts";
import { hasPartnerBudget } from "@/lib/owner-labels";
import { parseAmountFromTranscript } from "@/lib/parse-amount";
import {
  isIncomeReceiptPhrase,
  looksLikeGoalDeposit,
  tryParsePlanningInput,
} from "@/lib/planning/parse-input";
import { mergeTransactionComment } from "@/lib/transaction-note";
import {
  canUseVoiceInput,
  cancelVoiceRecording,
  finalizeVoiceCapture,
  mapVoiceError,
  parseVoiceTranscripts,
  startVoiceRecording,
} from "@/lib/voice";
import { enrichCategoriesWithAiMemory } from "@/lib/ai-memory";
import { useHouseholdBalances, useStore } from "@/store/useStore";
import type { CategoryDefinition, Locale, ParsedTransaction } from "@/types";

const VOICE_FLOW_TIMEOUT_MS = 32_000;
type VoiceUiState = "idle" | "recording" | "processing";

type PendingMatchEntry = {
  input: string;
  parsed: ParsedTransaction | null;
  match: Exclude<ExpectedPaymentMatchResult, { kind: "none" }>;
  selectedCandidateId: string | null;
};

function formatSignedToastAmount(
  amount: number,
  type: "income" | "expense",
  locale: "ru" | "en",
): string {
  const sign = type === "income" ? "+" : "−";
  return `${sign}${formatMoney(amount, locale)} ₽`;
}

function getReadableCategoryName(
  categoryId: string,
  type: "income" | "expense",
  categories: CategoryDefinition[],
  locale: Locale,
): string {
  const label = getCategoryLabel(categoryId, categories, locale);
  if (!label || label === categoryId) {
    return locale === "ru"
      ? type === "income"
        ? "Доход"
        : "Прочее"
      : type === "income"
        ? "Income"
        : "Other";
  }
  return label;
}

function withVoiceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("voice_timeout")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function VoiceRecorder({
  compact = false,
  onSubmitted,
}: {
  compact?: boolean;
  onSubmitted?: () => void;
} = {}) {
  const locale = useStore((s) => s.locale);
  const categories = useStore((s) => s.categories);
  const savingsGoals = useStore((s) => s.savingsGoals);
  const userName = useStore((s) => s.userName);
  const partnerName = useStore((s) => s.partnerName);
  const partnerKeywords = useStore((s) => s.partnerKeywords);
  const transactions = useStore((s) => s.transactions);
  const recurringTransactions = useStore((s) => s.recurringTransactions);
  const debts = useStore((s) => s.debts);
  const moneySetup = useStore((s) => s.moneySetup);
  const categoryBudgets = useStore((s) => s.categoryBudgets);
  const householdFilter = useStore((s) => s.householdFilter);
  const forecastHorizonMonths = useStore((s) => s.forecastHorizonMonths);
  const budgetMonthStartDay = useStore((s) => s.budgetMonthStartDay);
  const balances = useHouseholdBalances();
  const addTransaction = useStore((s) => s.addTransaction);
  const updateTransaction = useStore((s) => s.updateTransaction);
  const deleteTransaction = useStore((s) => s.deleteTransaction);
  const payDebt = useStore((s) => s.payDebt);
  const updateDebt = useStore((s) => s.updateDebt);
  const updateRecurring = useStore((s) => s.updateRecurring);
  const applyPlanningInput = useStore((s) => s.applyPlanningInput);
  const { toast } = useToast();

  const [text, setText] = useState("");
  const [comment, setComment] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceUiState>("idle");
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [matchQueue, setMatchQueue] = useState<PendingMatchEntry[]>([]);
  const [matchBusy, setMatchBusy] = useState(false);
  const primaryInputRef = useRef<HTMLTextAreaElement | null>(null);
  const trimmedText = text.trim();
  const canSubmit = trimmedText.length > 0;
  const recording = voiceState === "recording";
  const voiceProcessing = voiceState === "processing";
  const busy = submitBusy || recording || voiceProcessing;
  const addDisabled = !canSubmit || busy;
  const micDisabled = !voiceAvailable || submitBusy || voiceProcessing;
  const voiceUnavailableTitle =
    locale === "ru"
      ? "Голосовой ввод недоступен в этом браузере"
      : "Voice input is unavailable in this browser";

  useEffect(() => {
    const available = canUseVoiceInput();
    if (!available) {
      console.warn("[voice] SpeechRecognition unavailable or audio capture unsupported");
    }
    setVoiceAvailable(available);
  }, []);

  useEffect(() => {
    return () => {
      void cancelVoiceRecording();
    };
  }, []);

  const handleTextChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.currentTarget.value);
  }, []);

  const handleTextInput = useCallback((event: FormEvent<HTMLTextAreaElement>) => {
    setText((event.currentTarget as HTMLTextAreaElement).value);
  }, []);

  const matcherState = buildMatcherState({
    locale,
    today: getLocalTodayIsoDate(),
    forecastHorizonMonths,
    categories,
    transactions,
    householdFilter,
    recurringTransactions,
    debts,
    moneySetup,
    categoryBudgets,
    budgetMonthStartDay,
    balances,
  });

  const activeMatch = matchQueue[0] ?? null;
  const activeCandidate =
    activeMatch?.match.kind === "single"
      ? activeMatch.match.candidate
      : activeMatch?.match.kind === "multiple"
        ? activeMatch.match.candidates.find(
            (candidate) => candidate.id === activeMatch.selectedCandidateId,
          ) ?? null
        : null;

  const formatExpectedStatus = useCallback(
    (candidate: ExpectedPaymentCandidate) =>
      resolveExpectedEventDisplayStatus({
        kind: "expense",
        event: {
          date: candidate.originalDate,
          recurringOccurrenceDate: candidate.recurringId ? candidate.originalDate : null,
          debtId: candidate.debtId,
          paymentSource: candidate.paymentSource,
          linkedEntityId: candidate.linkedEntityId,
        },
        history: [],
        today: matcherState.today,
        locale,
      }).label,
    [locale, matcherState.today],
  );

  const pushOrdinaryTransactions = useCallback(
    (items: Array<{ item: ParsedTransaction; line: string }>) => {
      if (items.length === 0) return;

      for (const entry of items) {
        addTransaction(entry.item, entry.line || entry.item.note);
      }

      if (items.length === 1) {
        const entry = items[0]!;
        const categoryLabel = getReadableCategoryName(
          entry.item.categoryId,
          entry.item.type,
          categories,
          locale,
        );
        const amountLabel = formatSignedToastAmount(entry.item.amount, entry.item.type, locale);
        toast(
          locale === "ru"
            ? `Добавлено: ${categoryLabel} ${amountLabel}`
            : `Added: ${categoryLabel} ${amountLabel}`,
          "success",
        );
        return;
      }

      const totalSigned = items.reduce(
        (sum, entry) => sum + (entry.item.type === "income" ? entry.item.amount : -entry.item.amount),
        0,
      );
      const amountLabel =
        totalSigned === 0
          ? ""
          : ` ${locale === "ru" ? "на сумму" : "for"} ${formatSignedToastAmount(
              Math.abs(totalSigned),
              totalSigned > 0 ? "income" : "expense",
              locale,
            )}`;
      toast(
        locale === "ru"
          ? `Добавлено ${items.length} ${ruPlural(items.length, "операция", "операции", "операций")}${amountLabel}`
          : `Added ${items.length} ${enPlural(items.length, "entry", "entries")}${amountLabel}`,
        "success",
      );
    },
    [addTransaction, categories, locale, toast],
  );

  const advanceMatchQueue = useCallback(() => {
    setMatchQueue((current) => {
      const next = current.slice(1);
      if (next.length === 0) {
        onSubmitted?.();
      }
      return next;
    });
  }, [onSubmitted]);

  const cancelMatchQueue = useCallback(() => {
    setMatchQueue([]);
  }, []);

  const confirmMatchedCandidate = useCallback(
    async (candidate: ExpectedPaymentCandidate, amountOverride?: number | null) => {
      if (!activeMatch || matchBusy) return;
      setMatchBusy(true);
      try {
        const baseParsed =
          activeMatch.parsed ??
          buildSyntheticPaymentTransaction(
            candidate,
            activeMatch.input,
            amountOverride && amountOverride > 0 ? amountOverride : undefined,
          );
        const actualAmount =
          amountOverride && amountOverride > 0
            ? amountOverride
            : baseParsed.amount > 0
              ? baseParsed.amount
              : candidate.amount;
        const actual: ParsedTransaction = {
          ...baseParsed,
          amount: actualAmount,
          type: "expense",
          categoryId: baseParsed.categoryId || candidate.categoryId,
          note: baseParsed.note || activeMatch.input || candidate.title,
          date: baseParsed.date || candidate.originalDate,
          owner: baseParsed.owner ?? candidate.owner,
          confirmed: true,
          recurringId: candidate.recurringId,
        };
        const ok = confirmExpectedPaymentFromInput({
          candidate,
          actual,
          transcript: activeMatch.input,
          actions: {
            addTransaction,
            updateTransaction,
            deleteTransaction,
            payDebt,
            updateDebt,
            updateRecurring,
          },
          lookups: {
            recurringTransactions,
            debts,
          },
        });
        if (!ok) {
          toast(
            locale === "ru"
              ? "Не удалось подтвердить оплату"
              : "Could not confirm payment",
            "error",
          );
          return;
        }
        toast(
          locale === "ru"
            ? `Платёж подтверждён · −${formatMoney(actualAmount, locale)} ₽`
            : `Payment confirmed · -${formatMoney(actualAmount, locale)} RUB`,
          "success",
        );
        advanceMatchQueue();
      } finally {
        setMatchBusy(false);
      }
    },
    [
      activeMatch,
      addTransaction,
      advanceMatchQueue,
      debts,
      deleteTransaction,
      locale,
      matchBusy,
      payDebt,
      recurringTransactions,
      toast,
      updateDebt,
      updateRecurring,
      updateTransaction,
    ],
  );

  const createMatchedAsNewExpense = useCallback(() => {
    if (!activeMatch) return;
    const candidate =
      activeCandidate ??
      (activeMatch.match.kind === "single"
        ? activeMatch.match.candidate
        : activeMatch.match.candidates[0] ?? null);
    if (!candidate) return;
    const baseParsed =
      activeMatch.parsed ?? buildSyntheticPaymentTransaction(candidate, activeMatch.input);
    const actual: ParsedTransaction = {
      ...baseParsed,
      note: baseParsed.note || activeMatch.input || candidate.title,
    };
    pushOrdinaryTransactions([{ item: actual, line: activeMatch.input }]);
    advanceMatchQueue();
  }, [activeCandidate, activeMatch, advanceMatchQueue, pushOrdinaryTransactions]);

  const parseLineToTransactions = useCallback(
    async (
      line: string,
      extraComment: string,
    ): Promise<{
      ordinary: Array<{ item: ParsedTransaction; line: string }>;
      matches: PendingMatchEntry[];
      handledPlanning: boolean;
      missingAmount: boolean;
    }> => {
      const parseLocale = inferParseLocale(line, locale);
      const enteredAmount = parseAmountFromTranscript(line, parseLocale);
      const noAmountMatch = matchInputToExpectedPayments({
        state: matcherState,
        input: line,
        parsed: null,
        today: matcherState.today,
      });

      if (enteredAmount <= 0) {
        return {
          ordinary: [],
          matches:
            noAmountMatch.kind === "none"
              ? []
              : [
                  {
                    input: line,
                    parsed: null,
                    match: noAmountMatch,
                    selectedCandidateId:
                      noAmountMatch.kind === "single"
                        ? noAmountMatch.candidate.id
                        : null,
                  },
                ],
          handledPlanning: false,
          missingAmount: noAmountMatch.kind === "none",
        };
      }

      const personalizedCategories = enrichCategoriesWithAiMemory(categories);
      const parsed = await parseVoiceTranscripts(line, parseLocale, personalizedCategories, {
        partnerName,
        partnerKeywords,
        myName: userName,
        hasPartner: hasPartnerBudget(partnerName, partnerKeywords),
      });
      if (!parsed || parsed.items.length === 0) {
        return {
          ordinary: [],
          matches: [],
          handledPlanning: false,
          missingAmount: false,
        };
      }

      const first = parsed.items[0];
      if (
        !first
          ? false
          : !isIncomeReceiptPhrase(line, locale) &&
            (looksLikeGoalDeposit(line, locale) || first.categoryId === "goal_jar")
      ) {
        const retry = tryParsePlanningInput(line, locale, savingsGoals);
        if (retry) {
          const ok = applyPlanningInput(retry);
          if (ok) {
            toast(t(locale, "planningInputSuccess"), "success");
            return {
              ordinary: [],
              matches: [],
              handledPlanning: true,
              missingAmount: false,
            };
          }
        }
      }

      const compactMulti = extractCompactMultiAmountInput(line);
      const separatedAmounts = extractSeparatedMoneyAmounts(line);
      const items =
        parsed.items.length === 1 &&
        (compactMulti?.amounts.length ?? separatedAmounts.length) > 1
          ? (compactMulti?.amounts ?? separatedAmounts).map((amount) => ({
              ...parsed.items[0]!,
              amount,
              note: compactMulti?.label || parsed.items[0]!.note,
            }))
          : parsed.items;

      const ordinary: Array<{ item: ParsedTransaction; line: string }> = [];
      const matches: PendingMatchEntry[] = [];

      for (const item of items) {
        const normalizedItem = {
          ...item,
          note: mergeTransactionComment(item.note, line, extraComment, item.amount),
        };
        const match =
          normalizedItem.type === "expense"
            ? matchInputToExpectedPayments({
                state: matcherState,
                input: line,
                parsed: normalizedItem,
                today: matcherState.today,
              })
            : { kind: "none" as const };
        if (match.kind === "none") {
          ordinary.push({ item: normalizedItem, line });
          continue;
        }
        matches.push({
          input: line,
          parsed: normalizedItem,
          match,
          selectedCandidateId: match.kind === "single" ? match.candidate.id : null,
        });
      }

      return {
        ordinary,
        matches,
        handledPlanning: false,
        missingAmount: false,
      };
    },
    [
      applyPlanningInput,
      categories,
      locale,
      matcherState,
      partnerKeywords,
      partnerName,
      savingsGoals,
      toast,
      userName,
    ],
  );

  const processValue = useCallback(
    async (rawValue: string) => {
      const value = rawValue.trim();
      if (!value || submitBusy || voiceProcessing) return;
      const nonEmptyLines = value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const isBulkLineList = nonEmptyLines.length > 1;

      setSubmitBusy(true);
      try {
        const planning = isBulkLineList
          ? null
          : tryParsePlanningInput(value, locale, savingsGoals);
        if (planning) {
          const ok = applyPlanningInput(planning);
          if (!ok) {
            toast(t(locale, "voiceTryManual"), "error");
            return;
          }
          setText("");
          setComment("");
          if (
            planning.kind === "goal_deposit" ||
            planning.kind === "goal_deposit_by_name"
          ) {
            const name =
              planning.kind === "goal_deposit_by_name"
                ? planning.goalName
                : (savingsGoals.find((g) => g.id === planning.goalId)?.name ??
                  planning.goalId);
            toast(
              t(locale, "planningGoalDepositSuccess", {
                amount: formatMoney(planning.amount, locale),
                name,
              }),
              "success",
            );
          } else {
            toast(t(locale, "planningInputSuccess"), "success");
          }
          onSubmitted?.();
          return;
        }

        const ordinary: Array<{ item: ParsedTransaction; line: string }> = [];
        const matches: PendingMatchEntry[] = [];
        let missingAmountFound = false;

        for (const line of (isBulkLineList ? nonEmptyLines : [value])) {
          const result = await parseLineToTransactions(line, comment.trim());
          ordinary.push(...result.ordinary);
          matches.push(...result.matches);
          missingAmountFound = missingAmountFound || result.missingAmount;
          if (result.handledPlanning) {
            continue;
          }
        }

        if (ordinary.length > 0) {
          pushOrdinaryTransactions(ordinary);
        }

        setText("");
        setComment("");

        if (matches.length > 0) {
          setMatchQueue(matches);
          return;
        }

        if (ordinary.length > 0) {
          onSubmitted?.();
          return;
        }

        if (missingAmountFound) {
          toast(t(locale, "voiceAmountMissing"), "error");
          return;
        }

        toast(t(locale, "voiceTryManual"), "error");
      } finally {
        setSubmitBusy(false);
      }
    },
    [
      applyPlanningInput,
      comment,
      locale,
      onSubmitted,
      parseLineToTransactions,
      pushOrdinaryTransactions,
      savingsGoals,
      submitBusy,
      toast,
      voiceProcessing,
    ],
  );

  const submitText = useCallback(
    async (event?: FormEvent<HTMLFormElement> | MouseEvent<HTMLButtonElement>) => {
      event?.preventDefault();
      event?.stopPropagation();

      const liveValue = primaryInputRef.current?.value ?? text;
      const value = liveValue.trim();
      if (!value || busy) return;

      if (liveValue !== text) {
        setText(liveValue);
      }

      await processValue(value);
    },
    [busy, processValue, text],
  );

  const onVoiceClick = useCallback(async () => {
    if (submitBusy || voiceProcessing) return;

    if (voiceState === "idle") {
      const started = await startVoiceRecording(locale);
      if (!started.ok) {
        if (started.error === "unavailable") {
          console.warn("[voice] SpeechRecognition unavailable");
        } else if (started.error === "mic_denied") {
          console.warn("[voice] microphone permission error");
        }
        toast(t(locale, mapVoiceError(started.error)), "error");
        setVoiceState("idle");
        return;
      }
      setVoiceState("recording");
      toast(t(locale, "voiceMicLive"), "success");
      return;
    }

    if (voiceState !== "recording") return;

    setVoiceState("processing");
    let result: Awaited<ReturnType<typeof finalizeVoiceCapture>>;
    try {
      result = await withVoiceTimeout(finalizeVoiceCapture(locale), VOICE_FLOW_TIMEOUT_MS);
    } catch {
      result = { text: "", error: "stt_failed" };
    }
    if (!result.text) {
      toast(t(locale, mapVoiceError(result.error)), "error");
      setVoiceState("idle");
      return;
    }
    try {
      setText(result.text);
      await processValue(result.text);
    } finally {
      setVoiceState("idle");
    }
  }, [locale, processValue, submitBusy, toast, voiceProcessing, voiceState]);

  const voiceButtonIcon = voiceProcessing ? (
    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
  ) : recording ? (
    <Square className="h-5 w-5 fill-current" aria-hidden />
  ) : (
    <Mic className="h-5 w-5" aria-hidden />
  );

  const voiceButtonLabel = recording ? t(locale, "voiceStopAria") : t(locale, "voiceMicLive");

  return (
    <section
      className={compact ? "flex flex-col items-center" : "flex flex-col items-center py-2"}
      data-onboarding="voice"
    >
      <div className={`w-full max-w-md ${compact ? "space-y-1" : "space-y-1.5"}`}>
        {compact ? (
          <>
            <label className="block text-xs font-medium text-muted-foreground">
              {locale === "ru" ? "Что добавить?" : "What to add?"}
            </label>
            <div className="flex items-start gap-2">
              <textarea
                ref={primaryInputRef}
                name="quick-entry"
                value={text}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setText(value);
                }}
                onInput={(e) => {
                  const value = (e.currentTarget as HTMLTextAreaElement).value;
                  setText(value);
                }}
                placeholder="500 продукты"
                rows={2}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                className="flex min-h-[44px] min-w-0 flex-1 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm leading-snug placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                type="button"
                variant={recording ? "destructive" : "outline"}
                className="h-11 w-11 shrink-0 border-primary/20 bg-primary/5 p-0"
                disabled={micDisabled}
                onClick={() => void onVoiceClick()}
                aria-label={voiceButtonLabel}
                title={voiceAvailable ? undefined : voiceUnavailableTitle}
              >
                {voiceButtonIcon}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-stretch gap-2">
            <textarea
              name="quick-entry"
              value={text}
              onChange={handleTextChange}
              onInput={handleTextInput}
              placeholder={t(locale, "fallbackPlaceholder")}
              rows={2}
              disabled={submitBusy || voiceProcessing}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="flex min-h-[64px] min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
            <Button
              type="button"
              variant={recording ? "destructive" : "outline"}
              className="h-11 w-11 shrink-0 p-0"
              disabled={micDisabled}
              onClick={() => void onVoiceClick()}
              aria-label={voiceButtonLabel}
              title={voiceAvailable ? undefined : voiceUnavailableTitle}
            >
              {voiceButtonIcon}
            </Button>
          </div>
        )}

        {compact ? (
          <div className="space-y-1.5">
            <button
              type="button"
              className="text-left text-[11px] text-muted-foreground/65 transition-colors hover:text-muted-foreground/85"
              onClick={() => setCommentOpen((prev) => !prev)}
            >
              {commentOpen
                ? locale === "ru"
                  ? "Скрыть комментарий"
                  : "Hide comment"
                : locale === "ru"
                  ? "Добавить комментарий"
                  : "Add comment"}
            </button>
            {commentOpen ? (
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t(locale, "voiceCommentPlaceholder")}
                rows={1}
                maxLength={120}
                disabled={submitBusy || voiceProcessing}
                className="flex min-h-[40px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              />
            ) : null}
          </div>
        ) : (
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t(locale, "voiceCommentPlaceholder")}
            rows={1}
            maxLength={120}
            disabled={submitBusy || voiceProcessing}
            className="flex min-h-[40px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
        )}

        <Button
          type="button"
          variant="default"
          className={`${compact ? "h-[34px]" : "h-10"} w-full`}
          disabled={addDisabled}
          onClick={(event) => void submitText(event)}
        >
          {submitBusy || voiceProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t(locale, "voiceProcessing")}
            </>
          ) : (
            "Добавить"
          )}
        </Button>
      </div>

      <Dialog open={Boolean(activeMatch)} onOpenChange={(open) => !open && cancelMatchQueue()}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {activeMatch?.match.kind === "multiple"
                ? locale === "ru"
                  ? "На какой платёж отнести операцию?"
                  : "Which expected payment should this match?"
                : locale === "ru"
                  ? "Похоже, это оплата ожидаемого платежа"
                  : "This looks like an expected payment"}
            </DialogTitle>
          </DialogHeader>

          {activeMatch?.match.kind === "multiple" && !activeCandidate ? (
            <div className="space-y-2">
              {activeMatch.match.candidates.map((candidate) => (
                <Button
                  key={candidate.id}
                  type="button"
                  variant="outline"
                  className="h-auto w-full flex-col items-start gap-1 py-3 text-left"
                  onClick={() =>
                    setMatchQueue((current) =>
                      current.map((entry, index) =>
                        index === 0 ? { ...entry, selectedCandidateId: candidate.id } : entry,
                      ),
                    )
                  }
                >
                  <span className="font-medium">{candidate.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatMoney(candidate.amount, locale)} ₽ ·{" "}
                    {formatTransactionDate(candidate.originalDate, locale)}
                  </span>
                </Button>
              ))}
              <Button type="button" variant="secondary" className="w-full" onClick={createMatchedAsNewExpense}>
                {locale === "ru" ? "Создать как новый расход" : "Create as a new expense"}
              </Button>
            </div>
          ) : activeCandidate ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="font-medium">{activeCandidate.title}</div>
                <div className="mt-1 text-lg font-semibold">
                  {formatMoney(activeCandidate.amount, locale)} ₽
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {formatExpectedStatus(activeCandidate)}
                </div>
              </div>

              {activeMatch.match.kind === "single" && activeMatch.match.amountMismatch ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {locale === "ru"
                      ? `Ожидаемый платёж — ${formatMoney(activeCandidate.amount, locale)} ₽. Вы указали — ${formatMoney(activeMatch.match.enteredAmount ?? 0, locale)} ₽.`
                      : `Expected payment is ${formatMoney(activeCandidate.amount, locale)} RUB, but you entered ${formatMoney(activeMatch.match.enteredAmount ?? 0, locale)} RUB.`}
                  </p>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={matchBusy}
                    onClick={() => void confirmMatchedCandidate(activeCandidate, activeMatch.match.enteredAmount)}
                  >
                    {locale === "ru"
                      ? `Оплатить ${formatMoney(activeMatch.match.enteredAmount ?? 0, locale)} ₽`
                      : `Pay ${formatMoney(activeMatch.match.enteredAmount ?? 0, locale)} RUB`}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={matchBusy}
                    onClick={() => void confirmMatchedCandidate(activeCandidate, activeCandidate.amount)}
                  >
                    {locale === "ru"
                      ? `Оплатить ожидаемые ${formatMoney(activeCandidate.amount, locale)} ₽`
                      : `Pay expected ${formatMoney(activeCandidate.amount, locale)} RUB`}
                  </Button>
                  <Button type="button" variant="secondary" className="w-full" onClick={createMatchedAsNewExpense}>
                    {locale === "ru" ? "Создать как новый расход" : "Create as a new expense"}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={cancelMatchQueue}>
                    {locale === "ru" ? "Отмена" : "Cancel"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    type="button"
                    className="w-full"
                    disabled={matchBusy}
                    onClick={() =>
                      void confirmMatchedCandidate(
                        activeCandidate,
                        activeMatch?.parsed?.amount ?? null,
                      )
                    }
                  >
                    {locale === "ru" ? "Подтвердить оплату" : "Confirm payment"}
                  </Button>
                  <Button type="button" variant="secondary" className="w-full" onClick={createMatchedAsNewExpense}>
                    {locale === "ru" ? "Создать как новый расход" : "Create as a new expense"}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={cancelMatchQueue}>
                    {locale === "ru" ? "Отмена" : "Cancel"}
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
