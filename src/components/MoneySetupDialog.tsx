"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCategoryLabel, sortCategoriesByLabel } from "@/lib/categories";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/useStore";

type MoneySetupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showHouseholdToggle: boolean;
};

const ESSENTIAL_PRIORITY_IDS = [
  "groceries",
  "transport",
  "health",
  "kids_family",
  "household_supplies",
  "shopping",
];

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function parseAmount(value: string): number | null {
  const normalized = value.replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

export function MoneySetupDialog({
  open,
  onOpenChange,
  showHouseholdToggle,
}: MoneySetupDialogProps) {
  const locale = useStore((s) => s.locale);
  const moneySetup = useStore((s) => s.moneySetup);
  const recurringTransactions = useStore((s) => s.recurringTransactions);
  const categories = useStore((s) => s.categories);
  const updateMoneySetup = useStore((s) => s.updateMoneySetup);
  const { toast } = useToast();

  const recurringOptions = useMemo(
    () =>
      recurringTransactions
        .filter((item) => item.type === "expense" && item.enabled)
        .sort((a, b) => a.note.localeCompare(b.note, locale === "ru" ? "ru" : "en")),
    [locale, recurringTransactions],
  );

  const categoryOptions = useMemo(() => {
    const expenseCategories = sortCategoriesByLabel(
      categories.filter((category) => category.type === "expense"),
      categories,
      locale,
    );
    const priority = new Map(ESSENTIAL_PRIORITY_IDS.map((id, index) => [id, index]));
    return [...expenseCategories].sort((a, b) => {
      const aPriority = priority.get(a.id);
      const bPriority = priority.get(b.id);
      if (aPriority != null && bPriority != null) return aPriority - bPriority;
      if (aPriority != null) return -1;
      if (bPriority != null) return 1;
      return getCategoryLabel(a.id, categories, locale).localeCompare(
        getCategoryLabel(b.id, categories, locale),
        locale === "ru" ? "ru" : "en",
      );
    });
  }, [categories, locale]);

  const [nextIncomeDate, setNextIncomeDate] = useState("");
  const [expectedIncomeAmount, setExpectedIncomeAmount] = useState("");
  const [requiredRecurringIds, setRequiredRecurringIds] = useState<string[]>([]);
  const [essentialCategoryIds, setEssentialCategoryIds] = useState<string[]>([]);
  const [useHouseholdBalance, setUseHouseholdBalance] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNextIncomeDate(moneySetup.nextIncomeDate ?? "");
    setExpectedIncomeAmount(
      moneySetup.expectedIncomeAmount != null ? String(moneySetup.expectedIncomeAmount) : "",
    );
    setRequiredRecurringIds(moneySetup.requiredRecurringIds);
    setEssentialCategoryIds(moneySetup.essentialCategoryIds);
    setUseHouseholdBalance(moneySetup.useHouseholdBalance);
  }, [moneySetup, open]);

  const handleSave = () => {
    updateMoneySetup({
      nextIncomeDate: nextIncomeDate || null,
      expectedIncomeAmount: parseAmount(expectedIncomeAmount),
      requiredRecurringIds,
      essentialCategoryIds,
      useHouseholdBalance: showHouseholdToggle ? useHouseholdBalance : false,
    });
    toast(locale === "ru" ? "Финансовая база сохранена" : "Financial base saved", "success");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,var(--tg-viewport-height,90vh))] max-w-sm flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-10 text-left">
          <DialogTitle className="text-base">
            {locale === "ru" ? "Финансовая база" : "Money setup"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {locale === "ru"
              ? "Коротко укажите доход и обязательные расходы."
              : "Quickly add your income and must-cover expenses."}
          </p>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-4 py-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              {locale === "ru" ? "Следующий доход" : "Next income"}
            </label>
            <Input
              type="date"
              value={nextIncomeDate}
              onChange={(event) => setNextIncomeDate(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              {locale === "ru" ? "Примерная сумма дохода" : "Estimated income amount"}
            </label>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder={locale === "ru" ? "Например, 120000" : "For example, 120000"}
              value={expectedIncomeAmount}
              onChange={(event) => setExpectedIncomeAmount(event.target.value)}
            />
          </div>

          <div className="space-y-2.5">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {locale === "ru"
                  ? "Обязательные регулярные платежи"
                  : "Required recurring payments"}
              </p>
              <p className="text-xs text-muted-foreground">
                {locale === "ru"
                  ? "Выберите траты, которые точно нужно закрыть."
                  : "Choose expenses that must be covered."}
              </p>
            </div>

            {recurringOptions.length > 0 ? (
              <div className="space-y-2">
                {recurringOptions.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-start gap-2 rounded-md border border-border/70 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={requiredRecurringIds.includes(item.id)}
                      onChange={() => setRequiredRecurringIds((prev) => toggleId(prev, item.id))}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">{item.note}</span>
                      <span className="block text-xs text-muted-foreground">
                        {getCategoryLabel(item.categoryId, categories, locale)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                {locale === "ru"
                  ? "Регулярных платежей пока нет. Можно добавить позже."
                  : "No recurring payments yet. You can add them later."}
              </p>
            )}
          </div>

          <div className="space-y-2.5">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {locale === "ru"
                  ? "Необходимые категории для жизни"
                  : "Essential life categories"}
              </p>
              <p className="text-xs text-muted-foreground">
                {locale === "ru"
                  ? "Отметьте то, без чего нельзя прожить до следующего дохода."
                  : "Mark what you need before the next income arrives."}
              </p>
            </div>

            <div className="space-y-2">
              {categoryOptions.map((category) => (
                <label
                  key={category.id}
                  className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={essentialCategoryIds.includes(category.id)}
                    onChange={() =>
                      setEssentialCategoryIds((prev) => toggleId(prev, category.id))
                    }
                  />
                  <span className="text-foreground">
                    {getCategoryLabel(category.id, categories, locale)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {showHouseholdToggle ? (
            <label className="flex items-start gap-2 rounded-md border border-border/70 px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={useHouseholdBalance}
                onChange={(event) => setUseHouseholdBalance(event.target.checked)}
              />
              <span>
                <span className="block font-medium text-foreground">
                  {locale === "ru"
                    ? "Считать по семейному балансу"
                    : "Use family balance"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {locale === "ru"
                    ? "Если расходы и доходы общие, можно учитывать общий остаток."
                    : "Use the shared balance if income and expenses are common."}
                </span>
              </span>
            </label>
          ) : null}
        </div>

        <div className="flex shrink-0 gap-2 border-t px-4 py-3">
          <Button type="button" className="flex-1" onClick={handleSave}>
            {locale === "ru" ? "Сохранить" : "Save"}
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            {locale === "ru" ? "Позже" : "Later"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
