import type {
  MoneySetup,
  MoneySetupIncomeRecurrence,
  MoneySetupIncomeSource,
  MoneySetupIncomeSourceKind,
} from "@/lib/money-setup";
import type { Locale } from "@/types";

export type IncomeSourceDraft = {
  id: string;
  label: string;
  expectedDate: string;
  expectedAmount: string;
  kind: MoneySetupIncomeSourceKind;
  recurrence: MoneySetupIncomeRecurrence;
  isPrimary: boolean;
};

export function makeIncomeSourceId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `income-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function toIncomeSourceDraft(
  source: MoneySetupIncomeSource,
): IncomeSourceDraft {
  return {
    id: source.id,
    label: source.label,
    expectedDate: source.expectedDate ?? "",
    expectedAmount:
      source.expectedAmount != null ? String(source.expectedAmount) : "",
    kind: source.kind,
    recurrence: source.recurrence ?? "monthly",
    isPrimary: Boolean(source.isPrimary),
  };
}

export function emptyIncomeSourceDraft(isPrimary: boolean): IncomeSourceDraft {
  return {
    id: makeIncomeSourceId(),
    label: "",
    expectedDate: "",
    expectedAmount: "",
    kind: "salary",
    recurrence: "monthly",
    isPrimary,
  };
}

export function hasLegacyIncomeSetup(setup: MoneySetup): boolean {
  return Boolean(setup.nextIncomeDate || setup.expectedIncomeAmount);
}

export function buildLegacyIncomeSourceDraft(
  setup: MoneySetup,
  locale: Locale,
): IncomeSourceDraft | null {
  if (!hasLegacyIncomeSetup(setup)) return null;

  return {
    id: makeIncomeSourceId(),
    label: locale === "ru" ? "Основной доход" : "Primary income",
      expectedDate: setup.nextIncomeDate ?? "",
      expectedAmount:
        setup.expectedIncomeAmount != null ? String(setup.expectedIncomeAmount) : "",
      kind: "salary",
      recurrence: "monthly",
      isPrimary: true,
  };
}

export function getPrimaryIncomeSourceDraft(
  drafts: IncomeSourceDraft[],
): IncomeSourceDraft | null {
  if (drafts.length === 0) return null;
  return drafts.find((item) => item.isPrimary) ?? drafts[0] ?? null;
}

export function startIncomeSourcesEditing(args: {
  moneySetup: MoneySetup;
  currentDrafts: IncomeSourceDraft[];
  locale: Locale;
  appendBlank?: boolean;
}): IncomeSourceDraft[] {
  const { moneySetup, currentDrafts, locale, appendBlank = false } = args;

  const baseDrafts =
    currentDrafts.length > 0
      ? currentDrafts
      : moneySetup.incomeSources.length > 0
        ? moneySetup.incomeSources.map(toIncomeSourceDraft)
        : (() => {
            const legacy = buildLegacyIncomeSourceDraft(moneySetup, locale);
            return legacy ? [legacy] : [];
          })();

  if (!appendBlank) {
    return baseDrafts.length > 0 ? baseDrafts : [emptyIncomeSourceDraft(true)];
  }

  if (baseDrafts.length === 0) {
    return [emptyIncomeSourceDraft(true)];
  }

  return [
    ...baseDrafts,
    emptyIncomeSourceDraft(false),
  ];
}

function parseAmount(value: string): number | null {
  const normalized = value.replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

export function buildIncomeSetupSavePayload(args: {
  showIncomeSources: boolean;
  incomeSources: IncomeSourceDraft[];
  nextIncomeDate: string;
  expectedIncomeAmount: string;
}): Pick<MoneySetup, "nextIncomeDate" | "expectedIncomeAmount" | "incomeSources"> {
  const normalizedIncomeSources: MoneySetupIncomeSource[] = args.incomeSources.map(
    (item) => ({
      id: item.id,
      label: item.label.trim(),
      expectedDate: item.expectedDate || null,
      expectedAmount: parseAmount(item.expectedAmount),
      kind: item.kind,
      recurrence: item.recurrence,
      intervalMonths: item.recurrence === "monthly" ? 1 : null,
      dayOfMonth:
        item.recurrence === "monthly" && item.expectedDate
          ? Number.parseInt(item.expectedDate.slice(8, 10), 10) || null
          : null,
      endDate: null,
      ...(item.isPrimary ? { isPrimary: true } : {}),
    }),
  );

  const primarySource = getPrimaryIncomeSourceDraft(args.incomeSources);

  return {
    nextIncomeDate:
      args.showIncomeSources && primarySource
        ? primarySource.expectedDate || null
        : args.nextIncomeDate || null,
    expectedIncomeAmount:
      args.showIncomeSources && primarySource
        ? parseAmount(primarySource.expectedAmount)
        : parseAmount(args.expectedIncomeAmount),
    incomeSources: normalizedIncomeSources,
  };
}
