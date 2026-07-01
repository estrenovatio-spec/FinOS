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
import { rentalEffectiveMonthlyNet } from "@/lib/business/rental-utilities";
import type { BusinessAsset } from "@/lib/business/types";
import { parseMoneyAmount } from "@/lib/business/parse-input";
import { formatMoney } from "@/lib/format-money";
import { t } from "@/lib/i18n";
import { useStore } from "@/store/useStore";

export function PassiveTransferDialog({
  asset,
  open,
  onOpenChange,
  onConfirm,
}: {
  asset: BusinessAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (amount: number, date: string) => void;
}) {
  const locale = useStore((s) => s.locale);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (!open || !asset) return;
    const plan = rentalEffectiveMonthlyNet(asset);
    setAmount(String(plan > 0 ? plan : asset.monthlyNet > 0 ? asset.monthlyNet : ""));
    setDate(new Date().toISOString().slice(0, 10));
  }, [open, asset]);

  const submit = () => {
    const n = parseMoneyAmount(amount);
    if (!n) return;
    onConfirm(n, date);
    onOpenChange(false);
  };

  if (!asset) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t(locale, "projectsTransferTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm font-medium">{asset.name}</p>
        <p className="text-xs text-muted-foreground">{t(locale, "projectsTransferHint")}</p>
        {asset.monthlyNet > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {t(locale, "projectsTransferPlan", {
              amount: formatMoney(asset.monthlyNet, locale),
            })}
          </p>
        ) : null}
        <Input
          type="text"
          inputMode="decimal"
          placeholder={t(locale, "txAmount")}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Button type="button" className="w-full" disabled={!amount.trim()} onClick={submit}>
          {t(locale, "projectsTransferConfirm")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
