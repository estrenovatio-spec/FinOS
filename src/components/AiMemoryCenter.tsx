"use client";

import { BrainCircuit, ChevronDown, CircleAlert, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { getCategoryLabel } from "@/lib/categories";
import {
  buildAiCoachingContext,
  buildFamilyAdvisorSpotlight,
} from "@/lib/ai-coaching-context";
import { getCurrentBudgetPeriod } from "@/lib/budget-period";
import { formatIsoDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useFamilyAdvisorSpotlight } from "@/components/useFamilyAdvisorSpotlight";
import {
  aiMemoryConfidence,
  aiMemoryReason,
  deleteAiMemoryRule,
  getAiMemoryRules,
  type AiMemoryRule,
} from "@/lib/ai-memory";
import { useCategories, useStore, useTransactions } from "@/store/useStore";
import type { Locale } from "@/types";

function sourceLabel(
  source: AiMemoryRule["source"],
  locale: "ru" | "en",
): string {
  if (locale !== "ru") return source;
  if (source === "correction") return "исправление";
  if (source === "voice") return "голос";
  return "текст";
}

function ruleCountLabel(count: number, locale: Locale): string {
  if (locale !== "ru") return `${count} ${count === 1 ? "rule" : "rules"}`;
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} правило`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return `${count} правила`;
  return `${count} правил`;
}

function localDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function dateHeading(dateKey: string, locale: Locale): string {
  const today = localDateKey(new Date().toISOString());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = localDateKey(yesterdayDate.toISOString());
  if (dateKey === today) return locale === "ru" ? "Сегодня" : "Today";
  if (dateKey === yesterday) return locale === "ru" ? "Вчера" : "Yesterday";
  return formatIsoDate(dateKey, locale);
}

function groupRulesByDate(
  rules: AiMemoryRule[],
): { dateKey: string; rules: AiMemoryRule[] }[] {
  const groups = new Map<string, AiMemoryRule[]>();
  for (const rule of rules) {
    const dateKey = localDateKey(rule.lastSeenAt);
    groups.set(dateKey, [...(groups.get(dateKey) ?? []), rule]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, groupedRules]) => ({
      dateKey,
      rules: groupedRules.sort(
        (a, b) =>
          b.weight - a.weight || b.lastSeenAt.localeCompare(a.lastSeenAt),
      ),
    }));
}

type CategoryRuleGroup = {
  key: string;
  categoryId: string;
  type: AiMemoryRule["type"];
  label: string;
  rules: AiMemoryRule[];
  confidence: number;
  corrections: number;
  signals: number;
};

function groupRulesByCategory(
  rules: AiMemoryRule[],
  categories: ReturnType<typeof useCategories>,
  locale: Locale,
): CategoryRuleGroup[] {
  const groups = new Map<string, CategoryRuleGroup>();
  for (const rule of rules) {
    const key = `${rule.type}:${rule.categoryId}`;
    const prev =
      groups.get(key) ??
      ({
        key,
        categoryId: rule.categoryId,
        type: rule.type,
        label: getCategoryLabel(rule.categoryId, categories, locale),
        rules: [],
        confidence: 0,
        corrections: 0,
        signals: 0,
      } satisfies CategoryRuleGroup);
    prev.rules.push(rule);
    prev.corrections += rule.source === "correction" ? 1 : 0;
    prev.signals += rule.signalCount ?? 1;
    groups.set(key, prev);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      rules: group.rules.sort(
        (a, b) =>
          aiMemoryConfidence(b) - aiMemoryConfidence(a) ||
          b.weight - a.weight ||
          b.lastSeenAt.localeCompare(a.lastSeenAt),
      ),
      confidence: Math.round(
        group.rules.reduce((sum, rule) => sum + aiMemoryConfidence(rule), 0) /
          Math.max(1, group.rules.length),
      ),
    }))
    .sort(
      (a, b) =>
        b.corrections - a.corrections ||
        b.confidence - a.confidence ||
        b.signals - a.signals,
    );
}

function confidenceTone(confidence: number): string {
  if (confidence >= 82) return "text-emerald-700 dark:text-emerald-400";
  if (confidence >= 62) return "text-amber-700 dark:text-amber-300";
  return "text-muted-foreground";
}

function typeLabel(type: AiMemoryRule["type"], locale: Locale): string {
  if (locale !== "ru") return type === "income" ? "income" : "expense";
  return type === "income" ? "доход" : "расход";
}

export function AiMemoryCenter() {
  const locale = useStore((s) => s.locale);
  const budgetMonthStartDay = useStore((s) => s.budgetMonthStartDay);
  const savingsGoals = useStore((s) => s.savingsGoals);
  const categoryBudgets = useStore((s) => s.categoryBudgets);
  const transactions = useTransactions();
  const categories = useCategories();
  const updateCategory = useStore((s) => s.updateCategory);
  const [learnedRules, setLearnedRules] = useState(() => getAiMemoryRules());
  const [openDateKey, setOpenDateKey] = useState<string | null>(null);
  const [memoryInfoOpen, setMemoryInfoOpen] = useState(false);
  const memorySignature = learnedRules
    .map(
      (rule) => `${rule.phrase}:${rule.categoryId}:${rule.type}:${rule.weight}`,
    )
    .join("|");

  const period = useMemo(
    () => getCurrentBudgetPeriod(budgetMonthStartDay),
    [budgetMonthStartDay],
  );

  const ctx = useMemo(() => {
    void memorySignature;
    return buildAiCoachingContext(
      transactions,
      savingsGoals,
      categoryBudgets,
      (id) => getCategoryLabel(id, categories, locale),
      period.from,
      period.to,
      categories,
      locale,
    );
  }, [
    categories,
    categoryBudgets,
    locale,
    memorySignature,
    period.from,
    period.to,
    savingsGoals,
    transactions,
  ]);

  const baseSpotlight = buildFamilyAdvisorSpotlight(ctx, locale);
  const spotlight = useFamilyAdvisorSpotlight(baseSpotlight, ctx, locale);
  const ruleGroups = groupRulesByDate(learnedRules);
  const categoryGroups = useMemo(
    () => groupRulesByCategory(learnedRules, categories, locale),
    [categories, learnedRules, locale],
  );
  const correctionCount = learnedRules.filter((rule) => rule.source === "correction").length;
  const topRule = learnedRules
    .slice()
    .sort(
      (a, b) =>
        aiMemoryConfidence(b) - aiMemoryConfidence(a) ||
        b.lastSeenAt.localeCompare(a.lastSeenAt),
    )[0];
  const frequentPhrases = learnedRules
    .slice()
    .sort(
      (a, b) =>
        (b.signalCount ?? 1) - (a.signalCount ?? 1) ||
        b.weight - a.weight ||
        b.lastSeenAt.localeCompare(a.lastSeenAt),
    )
    .slice(0, 10);

  useEffect(() => {
    if (
      openDateKey &&
      !ruleGroups.some((group) => group.dateKey === openDateKey)
    ) {
      setOpenDateKey(null);
    }
  }, [openDateKey, ruleGroups]);

  const removeRule = (rule: AiMemoryRule) => {
    deleteAiMemoryRule(rule);
    const category = categories.find((cat) => cat.id === rule.categoryId && cat.type === rule.type);
    if (category?.keywords.some((kw) => kw.toLowerCase() === rule.phrase.toLowerCase())) {
      updateCategory(category.id, {
        keywords: category.keywords.filter(
          (kw) => kw.toLowerCase() !== rule.phrase.toLowerCase(),
        ),
      });
    }
    setLearnedRules(getAiMemoryRules());
  };

  const forgetCategoryGroup = (group: CategoryRuleGroup) => {
    const phrases = new Set(group.rules.map((rule) => rule.phrase.toLowerCase()));
    for (const rule of group.rules) {
      deleteAiMemoryRule(rule);
    }
    const category = categories.find(
      (cat) => cat.id === group.categoryId && cat.type === group.type,
    );
    if (category) {
      updateCategory(category.id, {
        keywords: category.keywords.filter(
          (kw) => !phrases.has(kw.toLowerCase()),
        ),
      });
    }
    setLearnedRules(getAiMemoryRules());
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
        <div className="mb-2 flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-primary" aria-hidden />
          <p className="text-sm font-medium">
            {locale === "ru" ? "Финсоветник заметил" : "Advisor noticed"}
          </p>
        </div>
        {spotlight ? (
          <div
            className={cn(
              "rounded-md border bg-background/70 p-2.5 text-sm leading-snug",
              spotlight.tone === "risk"
                ? "border-red-500/20"
                : spotlight.tone === "watch"
                  ? "border-amber-500/25"
                  : "border-emerald-500/20",
            )}
          >
            <p className="font-medium">{spotlight.title}</p>
            <p className="mt-1 text-muted-foreground">{spotlight.text}</p>
            <p className="mt-2 text-xs font-medium text-foreground">
              {spotlight.action}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {locale === "ru"
              ? "Пока мало операций. Советник начнёт замечать привычки после нескольких записей."
              : "Not enough entries yet. The advisor will notice habits after a few records."}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="text-sm font-medium">
              {locale === "ru" ? "Финансовая память" : "Financial memory"}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground"
              onClick={() => setMemoryInfoOpen((open) => !open)}
              aria-label={
                locale === "ru"
                  ? "Что такое финансовая память"
                  : "What financial memory means"
              }
            >
              <CircleAlert className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {ruleCountLabel(learnedRules.length, locale)}
          </p>
        </div>
        {memoryInfoOpen ? (
          <div className="rounded-md border border-border/70 bg-muted/40 p-2.5 text-xs leading-snug text-muted-foreground">
            {locale === "ru" ? (
              <>
                <p className="font-medium text-foreground">Что это?</p>
                <p className="mt-1">
                  Приложение запоминает ваши слова из текста, голоса и
                  исправлений категорий: например, “обед”, “сад”, “реклама”.
                  Потом эти слова помогают точнее определять категорию новых
                  операций.
                </p>
                <p className="mt-2">
                  Самый сильный сигнал — когда вы исправили категорию вручную.
                  Лишнее правило можно удалить из списка ниже.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-foreground">What is this?</p>
                <p className="mt-1">
                  The app remembers words from text, voice, and category
                  corrections so future entries land in the right category more
                  often.
                </p>
                <p className="mt-2">
                  Manual category corrections are the strongest signal. You can
                  delete any rule from the list below.
                </p>
              </>
            )}
          </div>
        ) : null}
        {learnedRules.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-sm leading-snug text-muted-foreground">
            {locale === "ru"
              ? "Память пустая. Запишите несколько операций голосом или текстом, а если категория ошиблась — исправьте её. Это самый сильный сигнал для обучения."
              : "Memory is empty. Add a few entries by voice or text, and correct the category when needed."}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded-md border border-border/70 bg-background p-2">
                <p className="text-[10px] text-muted-foreground">
                  {locale === "ru" ? "Категорий" : "Categories"}
                </p>
                <p className="text-sm font-semibold tabular-nums">
                  {categoryGroups.length}
                </p>
              </div>
              <div className="rounded-md border border-border/70 bg-background p-2">
                <p className="text-[10px] text-muted-foreground">
                  {locale === "ru" ? "Исправлений" : "Corrections"}
                </p>
                <p className="text-sm font-semibold tabular-nums">
                  {correctionCount}
                </p>
              </div>
              <div className="rounded-md border border-border/70 bg-background p-2">
                <p className="text-[10px] text-muted-foreground">
                  {locale === "ru" ? "Лучшее" : "Best"}
                </p>
                <p className="truncate text-sm font-semibold">
                  {topRule ? `${aiMemoryConfidence(topRule)}%` : "—"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">
                {locale === "ru" ? "Категории и привычные слова" : "Categories and familiar words"}
              </p>
              <div className="max-h-[min(360px,42vh)] space-y-2 overflow-y-auto overscroll-contain rounded-md border border-border/70 p-2">
                {categoryGroups.map((group) => (
                  <div key={group.key} className="rounded-md border border-border/70 bg-background p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{group.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {typeLabel(group.type, locale)} · {group.signals}{" "}
                          {locale === "ru" ? "сигнал(ов)" : "signal(s)"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn("text-xs font-semibold tabular-nums", confidenceTone(group.confidence))}>
                          {group.confidence}%
                        </p>
                        <button
                          type="button"
                          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          onClick={() => forgetCategoryGroup(group)}
                        >
                          {locale === "ru" ? "забыть" : "forget"}
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {group.rules.slice(0, 7).map((rule) => (
                        <span
                          key={`${rule.phrase}-${rule.categoryId}-${rule.type}`}
                          className="max-w-full truncate rounded-full bg-muted px-2 py-1 text-[11px] text-foreground"
                        >
                          {rule.phrase}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                      {aiMemoryReason(group.rules[0], locale)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {frequentPhrases.length > 0 ? (
              <div className="rounded-md border border-border/70 bg-muted/30 p-2.5">
                <p className="text-xs font-medium text-foreground">
                  {locale === "ru" ? "Привычные места и фразы" : "Frequent places and phrases"}
                </p>
                <div className="mt-2 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                  {frequentPhrases.map((rule) => (
                    <span
                      key={`${rule.phrase}-${rule.categoryId}-${rule.type}`}
                      className="rounded-full bg-background px-2 py-1 text-[11px] text-muted-foreground"
                    >
                      {rule.phrase} · {rule.signalCount}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">
                {locale === "ru" ? "Последние сигналы" : "Recent signals"}
              </p>
              <div className="max-h-[min(320px,40vh)] space-y-2 overflow-y-auto overscroll-contain rounded-md border border-border/70 p-2">
                {ruleGroups.map((group) => (
                  <div
                    key={group.dateKey}
                    className="rounded-md border border-border/70 bg-background"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left"
                      onClick={() =>
                        setOpenDateKey((current) =>
                          current === group.dateKey ? null : group.dateKey,
                        )
                      }
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-foreground">
                          {dateHeading(group.dateKey, locale)}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {ruleCountLabel(group.rules.length, locale)}
                        </span>
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          openDateKey === group.dateKey && "rotate-180",
                        )}
                        aria-hidden
                      />
                    </button>
                    {openDateKey === group.dateKey ? (
                      <ul className="max-h-64 space-y-1.5 overflow-y-auto border-t border-border/70 p-2">
                        {group.rules.map((rule) => (
                          <li
                            key={`${rule.phrase}-${rule.categoryId}-${rule.type}`}
                            className="flex items-center justify-between gap-2 rounded-md border border-border/70 p-2.5"
                          >
                            <div className="min-w-0 text-xs leading-snug">
                              <p className="truncate">
                                <span className="font-medium text-foreground">
                                  “{rule.phrase}”
                                </span>
                                <span
                                  className="mx-1 text-muted-foreground"
                                  aria-hidden
                                >
                                  →
                                </span>
                                <span>
                                  {getCategoryLabel(
                                    rule.categoryId,
                                    categories,
                                    locale,
                                  )}
                                </span>
                              </p>
                              <p className="text-muted-foreground">
                                {sourceLabel(rule.source, locale)} · {aiMemoryReason(rule, locale)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground"
                              onClick={() => removeRule(rule)}
                              aria-label={
                                locale === "ru" ? "Удалить правило" : "Delete rule"
                              }
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
