"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getCategoriesByType, getCategoryLabel } from "@/lib/categories";
import { formatTransactionDate } from "@/lib/format-date";
import { t } from "@/lib/i18n";
import { hasPartnerBudget, myDisplayName, partnerDisplayName } from "@/lib/owner-labels";
import { parseAmountFromTranscript } from "@/lib/parse-amount";
import { roundMoneyUp } from "@/lib/format-money";
import { clearCachedRecommendations } from "@/lib/storage";
import {
  buildStoredTransactionNote,
  displayTransactionNote,
  extractIncomeOccurrenceDateFromTransactionNote,
  extractIncomeSourceIdFromTransactionNote,
} from "@/lib/transaction-note";
import { normalizeGoalAmount } from "@/lib/goal-from-transaction";
import {
  collectHouseholdMemberUserIds,
  decodeUserIdFromHouseholdToken,
} from "@/lib/cloud/viewer-identity";
import {
  resolveTransactionOwnerForViewer,
  spenderFromViewerOwner,
} from "@/lib/transaction-owner";
import { useCloudStore } from "@/store/useCloudStore";
import {
  garageHasVehicles,
  guessDefaultVehicleId,
  isFuelExpense,
  isVehicleServiceExpense,
  partnerDefaultVehicleIds,
} from "@/lib/vehicle";
import { useCategories, useStore, useTransactions } from "@/store/useStore";
import type { BudgetOwner, ParsedTransaction, Transaction, TxType } from "@/types";
import { getFallbackCategoryId } from "@/lib/categories";

export type TransactionDialogDraft = ParsedTransaction & {
  title?: string | null;
  submitLabel?: string | null;
  subtitle?: string | null;
  sourceEditLabel?: string | null;
};

export interface TransactionDialogSaveResult {
  transactionId: string;
  amount: number;
  date: string;
  comment: string;
  type: TxType;
  categoryId: string;
  incomeSourceId?: string | null;
  incomeOccurrenceDate?: string | null;
}

interface TransactionEditDialogProps {
  transaction: Transaction | null;
  draft?: TransactionDialogDraft | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestSourceEdit?: (() => void) | null;
  dialogTitle?: string | null;
  dialogSubtitle?: string | null;
  submitLabel?: string | null;
  forceConfirmOnSave?: boolean;
  hideDelete?: boolean;
  fieldMode?: "full" | "expected_event";
  onDidSave?: ((result: TransactionDialogSaveResult) => void) | null;
}

export function TransactionEditDialog({
  transaction,
  draft = null,
  open,
  onOpenChange,
  onRequestSourceEdit = null,
  dialogTitle = null,
  dialogSubtitle = null,
  submitLabel = null,
  forceConfirmOnSave = false,
  hideDelete = false,
  fieldMode = "full",
  onDidSave = null,
}: TransactionEditDialogProps) {
  const locale = useStore((s) => s.locale);
  const userName = useStore((s) => s.userName);
  const partnerName = useStore((s) => s.partnerName);
  const partnerKeywords = useStore((s) => s.partnerKeywords);
  const categories = useCategories();
  const savingsGoals = useStore((s) => s.savingsGoals);
  const allTransactions = useTransactions();
  const token = useCloudStore((s) => s.token);
  const cloudUserId = useCloudStore((s) => s.cloudUserId);
  const storedMemberIds = useCloudStore((s) => s.householdMemberUserIds);
  const vehicles = useStore((s) => s.vehicles);
  const vehiclePrefs = useStore((s) => s.vehiclePrefs);
  const lastFuelVehicleId = useStore((s) => s.lastFuelVehicleId);
  const addTransaction = useStore((s) => s.addTransaction);
  const updateTransaction = useStore((s) => s.updateTransaction);
  const deleteTransaction = useStore((s) => s.deleteTransaction);
  const syncVehicleFromTransaction = useStore((s) => s.syncVehicleFromTransaction);

  const [amount, setAmount] = useState("");
  const [odometerKm, setOdometerKm] = useState("");
  const [fuelLiters, setFuelLiters] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [txType, setTxType] = useState<TxType>("expense");
  const [categoryId, setCategoryId] = useState("");
  const [owner, setOwner] = useState<BudgetOwner>("me");
  const [goalId, setGoalId] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [date, setDate] = useState("");
  const [comment, setComment] = useState("");
  const editSessionKeyRef = useRef<string | null>(null);
  const createMode = !transaction && Boolean(draft);
  const expectedEventMode = fieldMode === "expected_event";

  useEffect(() => {
    if (!open) {
      editSessionKeyRef.current = null;
      return;
    }
    const sessionKey =
      transaction?.id ??
      (draft?.incomeSourceId && draft?.incomeOccurrenceDate
        ? `${draft.incomeSourceId}:${draft.incomeOccurrenceDate}`
        : draft?.incomeSourceId) ??
      (draft
        ? `${draft.type}:${draft.categoryId}:${draft.date}:${draft.amount}`
        : null);
    if (!sessionKey || editSessionKeyRef.current === sessionKey) return;
    editSessionKeyRef.current = sessionKey;

    if (draft) {
      setAmount(String(draft.amount));
      setTxType(draft.type);
      setCategoryId(draft.categoryId);
      setOwner(draft.owner ?? "me");
      setDate(draft.date);
      setGoalId(draft.goalId ?? "");
      setGoalAmount(
        draft.goalAmount && draft.goalAmount > 0 ? String(draft.goalAmount) : "",
      );
      setOdometerKm(draft.odometerKm != null ? String(draft.odometerKm) : "");
      setFuelLiters(draft.fuelLiters != null ? String(draft.fuelLiters) : "");
      setVehicleId(draft.vehicleId ?? "");
      setComment(draft.note ?? "");
      return;
    }

    if (!transaction) return;
    const raw =
      useStore.getState().transactions.find((t) => t.id === transaction.id) ?? transaction;
    const viewerUserId = decodeUserIdFromHouseholdToken(token) ?? cloudUserId ?? null;
    const memberIds = collectHouseholdMemberUserIds(
      storedMemberIds,
      allTransactions,
      viewerUserId,
    );
    setAmount(String(raw.amount));
    setTxType(raw.type);
    setCategoryId(raw.categoryId);
    setOwner(resolveTransactionOwnerForViewer(raw, viewerUserId, memberIds));
    setDate(raw.date.slice(0, 10));
    setGoalId(raw.goalId ?? "");
    setGoalAmount(
      raw.goalAmount && raw.goalAmount > 0 ? String(raw.goalAmount) : "",
    );
    setOdometerKm(raw.odometerKm != null ? String(raw.odometerKm) : "");
    setFuelLiters(raw.fuelLiters != null ? String(raw.fuelLiters) : "");
    const partnerIds = partnerDefaultVehicleIds(vehiclePrefs, viewerUserId);
    const defaultVid =
      raw.vehicleId ??
      guessDefaultVehicleId(vehicles, vehiclePrefs, viewerUserId, partnerIds, lastFuelVehicleId) ??
      "";
    setVehicleId(defaultVid);
    setComment(displayTransactionNote(raw.note, raw.amount) ?? "");
  }, [
    allTransactions,
    cloudUserId,
    lastFuelVehicleId,
    open,
    storedMemberIds,
    draft,
    token,
    transaction,
    vehiclePrefs,
    vehicles,
  ]);

  if (!transaction && !draft) return null;

  const typeCategories = getCategoriesByType(categories, txType, locale);
  const isTransportFuelOrService =
    txType === "expense" &&
    categoryId === "transport" &&
    (isFuelExpense({ type: txType, categoryId, note: transaction?.note ?? draft?.note ?? "" }) ||
      isVehicleServiceExpense({ type: txType, categoryId, note: transaction?.note ?? draft?.note ?? "" }));
  const isFuelTx = isFuelExpense({ type: txType, categoryId, note: transaction?.note ?? draft?.note ?? "" });
  const isServiceTx = isVehicleServiceExpense({ type: txType, categoryId, note: transaction?.note ?? draft?.note ?? "" });
  const showVehicleFields =
    garageHasVehicles(vehicles) &&
    isTransportFuelOrService &&
    (isServiceTx || (isFuelTx && vehiclePrefs.fuelTrackingEnabled !== false));
  const showOdometer = showVehicleFields;
  const showFuelLiters = showVehicleFields && isFuelTx;

  const handleTypeChange = (next: TxType) => {
    setTxType(next);
    const valid = categories.some((c) => c.id === categoryId && c.type === next);
    if (!valid) {
      setCategoryId(getFallbackCategoryId(next));
    }
    if (next !== "income") {
      setGoalId("");
      setGoalAmount("");
    }
  };

  const handleSave = () => {
    const parsed = parseAmountFromTranscript(amount, locale);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    const goalAmountRaw = goalAmount.trim();
    const parsedGoal =
      goalId && goalAmountRaw.length > 0
        ? parseAmountFromTranscript(goalAmount, locale)
        : 0;

    const viewerUserId = decodeUserIdFromHouseholdToken(token) ?? cloudUserId ?? null;
    const memberIds = collectHouseholdMemberUserIds(
      storedMemberIds,
      allTransactions,
      viewerUserId,
    );
    const spender = partnerName
      ? spenderFromViewerOwner(viewerUserId, memberIds, owner)
      : null;

    const odometerRaw = odometerKm.trim().replace(/\s/g, "");
    const odometer =
      odometerRaw.length > 0 && showVehicleFields
        ? Math.max(0, Math.round(Number(odometerRaw) || 0))
        : null;
    const vid = showVehicleFields && vehicleId ? vehicleId : null;
    const fuelLitersRaw = fuelLiters.trim().replace(",", ".").replace(/\s/g, "");
    const liters =
      showFuelLiters && fuelLitersRaw.length > 0
        ? Math.max(0, Math.round((Number(fuelLitersRaw) || 0) * 100) / 100)
        : null;

    const roundedAmount = roundMoneyUp(parsed);
    const goalPatch = {
      goalId: txType === "income" && goalId && parsedGoal > 0 ? goalId : null,
      goalAmount:
        txType === "income" && goalId && parsedGoal > 0
          ? normalizeGoalAmount(parsedGoal)
          : null,
    };

    if (createMode && draft) {
      const linkedTransaction =
        draft.incomeSourceId != null
          ? allTransactions.find(
              (item) =>
                extractIncomeSourceIdFromTransactionNote(item.note) === draft.incomeSourceId &&
                (draft.incomeOccurrenceDate == null ||
                  extractIncomeOccurrenceDateFromTransactionNote(item.note) ===
                    draft.incomeOccurrenceDate),
            ) ?? null
          : null;
      const nextDate = date;
      const nextNote = buildStoredTransactionNote(
        comment,
        roundedAmount,
        draft.incomeSourceId,
        draft.incomeOccurrenceDate,
      );

      if (linkedTransaction) {
        updateTransaction(linkedTransaction.id, {
          amount: roundedAmount,
          type: txType,
          categoryId,
          date: nextDate,
          owner: spender?.owner,
          createdBy: spender?.createdBy,
          note: nextNote,
          ...goalPatch,
          ...(showVehicleFields ? { odometerKm: odometer, vehicleId: vid } : {}),
          ...(showFuelLiters ? { fuelLiters: liters } : {}),
        });
        if (odometer != null) {
          syncVehicleFromTransaction(linkedTransaction.id);
        }
        onDidSave?.({
          transactionId: linkedTransaction.id,
          amount: roundedAmount,
          date: nextDate,
          comment,
          type: txType,
          categoryId,
          incomeSourceId: draft.incomeSourceId,
          incomeOccurrenceDate: draft.incomeOccurrenceDate,
        });
      } else {
        const createdId = addTransaction({
          amount: roundedAmount,
          type: txType,
          categoryId,
          currency: "RUB",
          note: comment,
          date: nextDate,
          owner,
          createdBy: spender?.createdBy,
          incomeSourceId: draft.incomeSourceId,
          ...goalPatch,
          ...(showVehicleFields ? { odometerKm: odometer, vehicleId: vid } : {}),
          ...(showFuelLiters ? { fuelLiters: liters } : {}),
        });
        onDidSave?.({
          transactionId: createdId,
          amount: roundedAmount,
          date: nextDate,
          comment,
          type: txType,
          categoryId,
          incomeSourceId: draft.incomeSourceId,
          incomeOccurrenceDate: draft.incomeOccurrenceDate,
        });
      }
    } else if (transaction) {
      updateTransaction(transaction.id, {
        amount: roundedAmount,
        type: txType,
        categoryId,
        date,
        confirmed: forceConfirmOnSave ? true : undefined,
        owner: spender?.owner,
        createdBy: spender?.createdBy,
        note: comment,
        ...goalPatch,
        ...(showVehicleFields ? { odometerKm: odometer, vehicleId: vid } : {}),
        ...(showFuelLiters ? { fuelLiters: liters } : {}),
      });
      if (odometer != null) {
        syncVehicleFromTransaction(transaction.id);
      }
      onDidSave?.({
        transactionId: transaction.id,
        amount: roundedAmount,
        date,
        comment,
        type: txType,
        categoryId,
      });
    }
    clearCachedRecommendations();
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!transaction) {
      onOpenChange(false);
      return;
    }
    deleteTransaction(transaction.id);
    clearCachedRecommendations();
    onOpenChange(false);
  };

  const parsedAmount = parseAmountFromTranscript(amount, locale);
  const canSave =
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    ((expectedEventMode && Boolean(date)) || !createMode || Boolean(date)) &&
    categoryId.length > 0 &&
    typeCategories.some((c) => c.id === categoryId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(var(--tg-viewport-height,100dvh)-1rem)] w-[calc(100vw-1rem)] max-w-sm flex-col gap-0 overflow-hidden p-0 sm:max-h-[min(90dvh,42rem)]">
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-10 text-left">
          <DialogTitle>
            {dialogTitle ??
              (createMode
                ? draft?.title ?? (locale === "ru" ? "Подтвердить доход" : "Confirm income")
                : t(locale, "txEditTitle"))}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {dialogSubtitle ??
              (createMode
                ? draft?.subtitle ?? formatTransactionDate(date, locale)
                : formatTransactionDate(date || (transaction?.date ?? ""), locale))}
          </p>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 [-webkit-overflow-scrolling:touch]">
          {!expectedEventMode ? (
            <div className="space-y-1">
              <span className="text-sm font-medium">{t(locale, "txType")}</span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={txType === "expense" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => handleTypeChange("expense")}
                >
                  {t(locale, "expense")}
                </Button>
                <Button
                  type="button"
                  variant={txType === "income" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => handleTypeChange("income")}
                >
                  {t(locale, "income")}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="tx-amount">
              {t(locale, "txAmount")}
            </label>
            <Input
              id="tx-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500"
            />
          </div>
          <div className="space-y-1">
            {createMode || expectedEventMode ? (
              <>
                <label className="text-sm font-medium" htmlFor="tx-date">
                  {locale === "ru" ? "Дата" : "Date"}
                </label>
                <Input
                  id="tx-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </>
            ) : null}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="tx-comment">
              {t(locale, "txComment")}
            </label>
            <textarea
              id="tx-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t(locale, "txCommentPlaceholder")}
              rows={2}
              maxLength={120}
              className="flex min-h-[56px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-[11px] leading-tight text-muted-foreground">{t(locale, "txCommentHint")}</p>
          </div>
          {!expectedEventMode ? (
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="tx-category">
                {t(locale, "txCategory")}
              </label>
              <select
                id="tx-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {typeCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {getCategoryLabel(cat.id, categories, locale)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {!expectedEventMode && showVehicleFields ? (
            <div className="space-y-1">
              {vehicles.length > 1 ? (
                <>
                  <label className="text-sm font-medium" htmlFor="tx-vehicle">
                    {t(locale, "vehiclePickInTx")}
                  </label>
                  <select
                    id="tx-vehicle"
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              <label className="text-sm font-medium" htmlFor="tx-odometer">
                {t(locale, "vehicleTxOdometer")}
              </label>
              <Input
                id="tx-odometer"
                inputMode="numeric"
                value={odometerKm}
                onChange={(e) => setOdometerKm(e.target.value)}
                placeholder="125000"
              />
              {showFuelLiters ? (
                <>
                  <label className="text-sm font-medium" htmlFor="tx-fuel-liters">
                    {t(locale, "vehicleFuelLitersLabel")}
                  </label>
                  <Input
                    id="tx-fuel-liters"
                    inputMode="decimal"
                    value={fuelLiters}
                    onChange={(e) => setFuelLiters(e.target.value)}
                    placeholder="45"
                  />
                </>
              ) : null}
            </div>
          ) : null}
          {!expectedEventMode && txType === "income" && savingsGoals.length > 0 ? (
            <div className="space-y-1.5 rounded-md border border-dashed p-2.5">
              <p className="text-sm font-medium">{t(locale, "txGoal")}</p>
              <select
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{t(locale, "txGoalNone")}</option>
                {savingsGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              {goalId ? (
                <>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={goalAmount}
                    onChange={(e) => setGoalAmount(e.target.value)}
                    placeholder={t(locale, "txGoalAmount")}
                  />
                  <p className="text-[11px] leading-tight text-muted-foreground">{t(locale, "txGoalHint")}</p>
                </>
              ) : null}
            </div>
          ) : null}
          {!expectedEventMode && hasPartnerBudget(partnerName, partnerKeywords) && (
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="tx-owner">
                {t(locale, "txOwner")}
              </label>
              <select
                id="tx-owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value as BudgetOwner)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="me">{myDisplayName(locale, userName)}</option>
                <option value="partner">{partnerDisplayName(partnerName)}</option>
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              {t(locale, "cancel")}
            </Button>
            <Button type="button" className="flex-1" disabled={!canSave} onClick={handleSave}>
              {submitLabel ??
                (createMode
                  ? draft?.submitLabel ?? (locale === "ru" ? "Сохранить" : "Save")
                  : t(locale, "confirm"))}
            </Button>
          </div>
          {createMode && onRequestSourceEdit ? (
            <div className="border-t pt-2">
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={onRequestSourceEdit}
              >
                {draft?.sourceEditLabel ??
                  (locale === "ru" ? "Изменить сумму или дату" : "Edit amount or date")}
              </Button>
            </div>
          ) : null}
          {!createMode && !hideDelete ? (
            <div className="border-t pt-2">
              <Button
                type="button"
                variant="destructive"
                className="w-full"
                onClick={handleDelete}
              >
                {t(locale, "txDelete")}
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
