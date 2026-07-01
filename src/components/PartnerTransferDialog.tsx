"use client";

import { ArrowLeft, ArrowLeftRight, ArrowRight, Minus, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { useTelegramBackHandler } from "@/hooks/useTelegramBackHandler";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format-money";
import { t } from "@/lib/i18n";
import {
  hasPartnerBudget,
  myDisplayName,
  partnerDisplayName,
  partnerTabLabel,
} from "@/lib/owner-labels";
import { useStore } from "@/store/useStore";
import type { Locale } from "@/types";

type Props = {
  locale: Locale;
  partnerName: string | null;
  partnerKeywords?: readonly string[];
  userName: string | null;
  variant?: "button" | "outline";
};

function TransferPartyChip({
  label,
  sign,
  active,
  onClick,
}: {
  label: string;
  sign: "minus" | "plus";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border-2 px-2 py-2.5 transition-colors",
        active
          ? "border-primary bg-primary/10 shadow-sm"
          : "border-transparent bg-card/80 opacity-75 hover:opacity-100",
      )}
    >
      <span className="line-clamp-2 text-center text-sm font-semibold leading-tight">{label}</span>
      <span
        className={cn(
          "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
          sign === "minus" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {sign === "minus" ? <Minus className="h-3 w-3 stroke-[3]" /> : <Plus className="h-3 w-3 stroke-[3]" />}
        {sign === "minus" ? "−" : "+"}
      </span>
    </button>
  );
}

export function PartnerTransferDialog({
  locale,
  partnerName,
  partnerKeywords = [],
  userName,
  variant = "outline",
}: Props) {
  const transferToPartner = useStore((s) => s.transferToPartner);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"to_partner" | "from_partner">("to_partner");
  const [done, setDone] = useState(false);
  const [lastDoneAmount, setLastDoneAmount] = useState(0);

  const handleTelegramBack = useCallback(() => {
    if (!open) return false;
    setOpen(false);
    setDone(false);
    return true;
  }, [open]);

  useTelegramBackHandler(handleTelegramBack, open);

  if (!hasPartnerBudget(partnerName, partnerKeywords)) return null;

  const partner =
    partnerDisplayName(partnerName) ||
    partnerTabLabel(locale, partnerName, partnerKeywords);
  const me = myDisplayName(locale, userName);
  const isToPartner = direction === "to_partner";
  const parsedPreview = Number(amount.replace(/\s/g, "").replace(",", "."));
  const showPreview = Number.isFinite(parsedPreview) && parsedPreview > 0;

  const handleSubmit = () => {
    const parsed = Number(amount.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const ok = transferToPartner(parsed, direction);
    if (ok) {
      setLastDoneAmount(parsed);
      setDone(true);
      setAmount("");
      setTimeout(() => {
        setOpen(false);
        setDone(false);
      }, 1200);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={variant === "outline" ? "outline" : "default"}
          size="sm"
          className="w-full gap-2"
        >
          <ArrowLeftRight className="h-4 w-4 shrink-0" />
          {t(locale, "partnerTransferOpen")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t(locale, "partnerTransferTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t(locale, "partnerTransferHint")}</p>

        <div className="rounded-2xl border-2 border-primary/25 bg-gradient-to-b from-primary/5 to-transparent p-3">
          <div className="flex items-center gap-1">
            <TransferPartyChip
              label={isToPartner ? me : partner}
              sign="minus"
              active
              onClick={() => setDirection(isToPartner ? "to_partner" : "from_partner")}
            />
            <div className="flex shrink-0 flex-col items-center justify-center px-0.5">
              <ArrowRight className="h-8 w-8 stroke-[2.5] text-primary" aria-hidden />
              {showPreview ? (
                <span className="mt-0.5 text-[11px] font-semibold tabular-nums text-foreground">
                  {formatMoney(parsedPreview)}
                </span>
              ) : (
                <span className="mt-0.5 text-[10px] text-muted-foreground">₽</span>
              )}
            </div>
            <TransferPartyChip
              label={isToPartner ? partner : me}
              sign="plus"
              active
              onClick={() => setDirection(isToPartner ? "to_partner" : "from_partner")}
            />
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            {isToPartner
              ? t(locale, "partnerTransferFlowTo", { name: partner })
              : t(locale, "partnerTransferFlowFrom", { name: partner })}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={isToPartner ? "default" : "outline"}
            className="flex-1 gap-1"
            onClick={() => setDirection("to_partner")}
          >
            <ArrowRight className="h-4 w-4 shrink-0" />
            <span className="truncate">{t(locale, "partnerTransferToShort", { name: partner })}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={!isToPartner ? "default" : "outline"}
            className="flex-1 gap-1"
            onClick={() => setDirection("from_partner")}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">{t(locale, "partnerTransferFromShort", { name: partner })}</span>
          </Button>
        </div>

        <Input
          inputMode="decimal"
          placeholder={t(locale, "partnerTransferAmount")}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {done ? (
          <p className="text-center text-sm font-medium text-primary">
            {t(locale, "partnerTransferDone", { amount: formatMoney(lastDoneAmount) })}
          </p>
        ) : (
          <Button type="button" className="w-full" onClick={handleSubmit}>
            {t(locale, "partnerTransferSubmit")}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
