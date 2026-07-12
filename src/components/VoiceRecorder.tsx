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
import { useToast } from "@/components/ui/toast";
import { getCategoryLabel } from "@/lib/categories";
import { hasPartnerBudget } from "@/lib/owner-labels";
import {
  tryParsePlanningInput,
  looksLikeGoalDeposit,
  isIncomeReceiptPhrase,
} from "@/lib/planning/parse-input";
import { formatMoney } from "@/lib/format-money";
import { t, ruPlural, enPlural } from "@/lib/i18n";
import { inferParseLocale } from "@/lib/locale-infer";
import { extractSeparatedMoneyAmounts } from "@/lib/multiple-amounts";
import { parseAmountFromTranscript } from "@/lib/parse-amount";
import { mergeTransactionComment } from "@/lib/transaction-note";
import {
  canUseVoiceInput,
  finalizeVoiceCapture,
  mapVoiceError,
  parseVoiceTranscripts,
  startVoiceRecording,
} from "@/lib/voice";
import { enrichCategoriesWithAiMemory } from "@/lib/ai-memory";
import { useStore } from "@/store/useStore";
import type { CategoryDefinition, Locale } from "@/types";

const VOICE_FLOW_TIMEOUT_MS = 32_000;

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
  const addTransaction = useStore((s) => s.addTransaction);
  const applyPlanningInput = useStore((s) => s.applyPlanningInput);
  const { toast } = useToast();

  const [text, setText] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const primaryInputRef = useRef<HTMLTextAreaElement | null>(null);
  const trimmedText = text.trim();
  const canSubmit = trimmedText.length > 0;
  const addDisabled = !canSubmit || busy;
  const micDisabled = !voiceAvailable || (busy && !recording);
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

  const handleTextChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.currentTarget.value);
  }, []);

  const handleTextInput = useCallback((event: FormEvent<HTMLTextAreaElement>) => {
    setText((event.currentTarget as HTMLTextAreaElement).value);
  }, []);

  const processValue = useCallback(async (rawValue: string) => {
    const value = rawValue.trim();
    if (!value || busy) return;
    const nonEmptyLines = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const isBulkLineList = nonEmptyLines.length > 1;

    setBusy(true);
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

      const parseLocale = inferParseLocale(value, locale);
      if (parseAmountFromTranscript(value, parseLocale) <= 0) {
        toast(t(locale, "voiceAmountMissing"), "error");
        return;
      }

      const personalizedCategories = enrichCategoriesWithAiMemory(categories);
      const parsed = await parseVoiceTranscripts(value, parseLocale, personalizedCategories, {
        partnerName,
        partnerKeywords,
        myName: userName,
        hasPartner: hasPartnerBudget(partnerName, partnerKeywords),
      });
      if (!parsed || parsed.items.length === 0) {
        toast(t(locale, "voiceTryManual"), "error");
        return;
      }

      // ИИ не знает про копилки — если фраза про отложить, но правила не сработали раньше, пробуем ещё раз
      const first = parsed.items[0];
      if (
        !isBulkLineList &&
        !isIncomeReceiptPhrase(value, locale) &&
        (looksLikeGoalDeposit(value, locale) || first.categoryId === "goal_jar")
      ) {
        const retry = tryParsePlanningInput(value, locale, savingsGoals);
        if (retry) {
          const ok = applyPlanningInput(retry);
          if (ok) {
            setText("");
            setComment("");
            if (
              retry.kind === "goal_deposit" ||
              retry.kind === "goal_deposit_by_name"
            ) {
              const name =
                retry.kind === "goal_deposit_by_name"
                  ? retry.goalName
                  : (savingsGoals.find((g) => g.id === retry.goalId)?.name ??
                    retry.goalId);
              toast(
                t(locale, "planningGoalDepositSuccess", {
                  amount: formatMoney(retry.amount, locale),
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
        }
      }

      const separatedAmounts = extractSeparatedMoneyAmounts(value);
      const items =
        parsed.items.length === 1 && separatedAmounts.length > 1
          ? separatedAmounts.map((amount) => ({ ...parsed.items[0], amount }))
          : parsed.items;

      const extraComment = comment.trim();
      for (const item of items) {
        const note = mergeTransactionComment(item.note, value, extraComment, item.amount);
        addTransaction({ ...item, note }, note || value);
      }
      setText("");
      setComment("");
      if (items.length === 1) {
        const item = items[0];
        const categoryLabel = getReadableCategoryName(
          item.categoryId,
          item.type,
          categories,
          locale,
        );
        const amountLabel = formatSignedToastAmount(item.amount, item.type, locale);
        toast(
          locale === "ru"
            ? `Добавлено: ${categoryLabel} ${amountLabel}`
            : `Added: ${categoryLabel} ${amountLabel}`,
          "success",
        );
      } else {
        const totalSigned = items.reduce(
          (sum, item) => sum + (item.type === "income" ? item.amount : -item.amount),
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
      }
      onSubmitted?.();
    } finally {
      setBusy(false);
    }
  }, [
    addTransaction,
    applyPlanningInput,
    busy,
    categories,
    locale,
    partnerName,
    partnerKeywords,
    savingsGoals,
    comment,
    onSubmitted,
    toast,
    userName,
  ]);

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
    if (busy) return;

    if (!recording) {
      const started = await startVoiceRecording(locale);
      if (!started.ok) {
        if (started.error === "unavailable") {
          console.warn("[voice] SpeechRecognition unavailable");
        } else if (started.error === "mic_denied") {
          console.warn("[voice] microphone permission error");
        }
        toast(t(locale, mapVoiceError(started.error)), "error");
        return;
      }
      setRecording(true);
      toast(t(locale, "voiceMicLive"), "success");
      return;
    }

    setRecording(false);
    setBusy(true);
    let result: Awaited<ReturnType<typeof finalizeVoiceCapture>>;
    try {
      result = await withVoiceTimeout(finalizeVoiceCapture(locale), VOICE_FLOW_TIMEOUT_MS);
    } catch {
      result = { text: "", error: "stt_failed" };
    } finally {
      setBusy(false);
    }
    if (!result.text) {
      toast(t(locale, mapVoiceError(result.error)), "error");
      return;
    }
    setText(result.text);
    await processValue(result.text);
  }, [busy, locale, processValue, recording, toast]);

  return (
    <section className={compact ? "flex flex-col items-center" : "flex flex-col items-center py-2"} data-onboarding="voice">
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
                className="h-[44px] w-9 shrink-0 border-primary/20 bg-primary/5 px-0"
                disabled={micDisabled}
                onClick={() => void onVoiceClick()}
                aria-label={recording ? t(locale, "voiceStopAria") : t(locale, "voiceMicLive")}
                title={voiceAvailable ? undefined : voiceUnavailableTitle}
              >
                {busy && !recording ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : recording ? (
                  <Square className="h-4 w-4" aria-hidden />
                ) : (
                  <Mic className="h-4 w-4" aria-hidden />
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-stretch gap-2">
              <textarea
                name="quick-entry"
                value={text}
                onChange={handleTextChange}
                onInput={handleTextInput}
                placeholder={t(locale, "fallbackPlaceholder")}
                rows={2}
                disabled={busy}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                className="flex min-h-[64px] min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              />
              <Button
                type="button"
                variant={recording ? "destructive" : "outline"}
                className="min-h-[64px] w-10 shrink-0 px-0"
                disabled={micDisabled}
                onClick={() => void onVoiceClick()}
                aria-label={recording ? t(locale, "voiceStopAria") : t(locale, "voiceMicLive")}
                title={voiceAvailable ? undefined : voiceUnavailableTitle}
              >
                {busy && !recording ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : recording ? (
                  <Square className="h-4 w-4" aria-hidden />
                ) : (
                  <Mic className="h-4 w-4" aria-hidden />
                )}
              </Button>
            </div>
          </>
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
                disabled={busy}
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
            disabled={busy}
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
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t(locale, "voiceProcessing")}
            </>
          ) : (
            "Добавить"
          )}
        </Button>
      </div>
    </section>
  );
}
