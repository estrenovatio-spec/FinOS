"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { BusinessTransaction } from "@/lib/business/types";
import { parseMoneyAmount } from "@/lib/business/parse-input";
import { formatMoney } from "@/lib/format-money";
import { t } from "@/lib/i18n";
import { useBusinessStore } from "@/store/useBusinessStore";
import { useStore } from "@/store/useStore";

function txKindLabel(tx: BusinessTransaction, locale: "ru" | "en"): string {
  switch (tx.kind) {
    case "cushion_deposit":
      return t(locale, "bizTxCushion");
    case "tax_deposit":
      return t(locale, "bizTxTax");
    case "family_withdrawal":
      return t(locale, "bizTxFamily");
    case "operating_income":
      return t(locale, "income");
    case "operating_expense":
      return t(locale, "expense");
    default:
      return "";
  }
}

export function BusinessTxEditDialog({
  transaction,
  open,
  onOpenChange,
}: {
  transaction: BusinessTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const locale = useStore((s) => s.locale);
  const updateTransaction = useBusinessStore((s) => s.updateTransaction);
  const removeTransaction = useBusinessStore((s) => s.removeTransaction);
  const { toast } = useToast();

  const [amount, setAmount] = useState("");
  const [txType, setTxType] = useState<"income" | "expense">("expense");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");

  const isOperating =
    transaction?.kind === "operating_income" ||
    transaction?.kind === "operating_expense";

  useEffect(() => {
    if (!transaction || !open) return;
    setAmount(String(transaction.amount));
    setTxType(transaction.type);
    setNote(transaction.note);
    setDate(transaction.date);
  }, [transaction, open]);

  const handleSave = () => {
    if (!transaction) return;
    const n = parseMoneyAmount(amount);
    if (!n) {
      toast(t(locale, "bizVoiceTryManual"), "error");
      return;
    }
    const ok = updateTransaction(transaction.id, {
      amount: n,
      type: isOperating ? txType : undefined,
      note,
      date,
    });
    if (!ok) return;
    toast(t(locale, "bizTxEditOk"), "success");
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!transaction) return;
    removeTransaction(transaction.id);
    toast(t(locale, "bizTxDeleted"), "success");
    onOpenChange(false);
  };

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t(locale, "bizTxEditTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {txKindLabel(transaction, locale)} · {transaction.date}
        </p>

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={txType === "income" ? "default" : "outline"}
            className="flex-1 text-xs"
            disabled={!isOperating}
            onClick={() => setTxType("income")}
          >
            {t(locale, "income")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={txType === "expense" ? "default" : "outline"}
            className="flex-1 text-xs"
            disabled={!isOperating}
            onClick={() => setTxType("expense")}
          >
            {t(locale, "expense")}
          </Button>
        </div>
        {!isOperating ? (
          <p className="text-[11px] text-muted-foreground">{t(locale, "bizTxEditTypeLocked")}</p>
        ) : null}

        <Input
          type="text"
          inputMode="decimal"
          placeholder={t(locale, "txAmount")}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input
          placeholder={t(locale, "bizTxNotePh")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <Button type="button" className="w-full" onClick={handleSave}>
          {t(locale, "bizSave")}
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="w-full"
          onClick={handleDelete}
        >
          {t(locale, "txDelete")}
        </Button>
        {transaction.amount > 0 ? (
          <p className="text-center text-[11px] tabular-nums text-muted-foreground">
            {txType === "income" ? "+" : "−"}
            {formatMoney(parseMoneyAmount(amount) ?? transaction.amount, locale)}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
