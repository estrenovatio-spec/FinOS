"use client";

import { Building2, LineChart, Pencil, Plus, Shield, Trash2, Wallet, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PassiveTransferDialog } from "@/components/app/PassiveTransferDialog";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  assetAnnualYieldPct,
  assetEffectiveHourlyRate,
  groupAssetsByType,
  typeAssetsSummary,
} from "@/lib/business/analytics";
import { PassiveReceiptHistory } from "@/components/app/PassiveReceiptHistory";
import { RentalUtilitiesHistory } from "@/components/app/RentalUtilitiesHistory";
import { passiveReceivedTotal } from "@/lib/business/passive";
import { parseMoneyAmount } from "@/lib/business/parse-input";
import {
  currentUtilitiesMonthKey,
  utilitiesAmountForMonth,
} from "@/lib/business/housing-utilities-log";
import {
  rentalEffectiveMonthlyNet,
  rentalUtilitiesForMonth,
} from "@/lib/business/rental-utilities";
import type { BusinessAsset, BusinessAssetType } from "@/lib/business/types";
import { formatMoney } from "@/lib/format-money";
import { t } from "@/lib/i18n";
import { useBusinessStore } from "@/store/useBusinessStore";
import { useStore } from "@/store/useStore";

const PROJECTS_HOW_HIDDEN_KEY = "voicebudget-business-projects-how-hidden";

function AssetIcon({
  type,
  className = "text-primary",
}: {
  type: BusinessAssetType;
  className?: string;
}) {
  if (type === "rental") return <Building2 className={`h-4 w-4 ${className}`} aria-hidden />;
  if (type === "freelance") return <Wallet className={`h-4 w-4 ${className}`} aria-hidden />;
  return <LineChart className={`h-4 w-4 ${className}`} aria-hidden />;
}

function assetTypeLabel(type: BusinessAssetType, locale: "ru" | "en"): string {
  if (type === "rental") return t(locale, "bizAssetRental");
  if (type === "freelance") return t(locale, "bizAssetFreelance");
  return t(locale, "bizAssetInvestment");
}

function sortFreelanceAssetsByPaymentStatus(
  assets: BusinessAsset[],
  receipts: ReturnType<typeof useBusinessStore.getState>["passiveReceipts"],
): BusinessAsset[] {
  return [...assets].sort((a, b) => {
    const receivedA = passiveReceivedTotal(receipts, a.id);
    const receivedB = passiveReceivedTotal(receipts, b.id);
    const remainingA = Math.max(0, a.monthlyNet - receivedA);
    const remainingB = Math.max(0, b.monthlyNet - receivedB);
    const paidA = receivedA > 0 && remainingA <= 0;
    const paidB = receivedB > 0 && remainingB <= 0;

    if (paidA !== paidB) return paidA ? 1 : -1;
    if (!paidA && remainingA !== remainingB) return remainingB - remainingA;
    if (paidA && receivedA !== receivedB) return receivedB - receivedA;
    return a.name.localeCompare(b.name, "ru");
  });
}

function AssetRow({
  asset,
  locale,
  receipts,
  receivedTotal,
  onTransfer,
  onEdit,
  onRemove,
}: {
  asset: BusinessAsset;
  locale: "ru" | "en";
  receipts: ReturnType<typeof useBusinessStore.getState>["passiveReceipts"];
  receivedTotal: number;
  onTransfer: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const yieldPct = assetAnnualYieldPct(asset);
  const effectiveHourly = assetEffectiveHourlyRate(asset);
  const utilities = rentalUtilitiesForMonth(asset);
  const netMonthly = rentalEffectiveMonthlyNet(asset);
  const freelanceRemaining = Math.max(0, asset.monthlyNet - receivedTotal);
  const freelanceStatus =
    asset.type === "freelance" && receivedTotal > 0
      ? freelanceRemaining > 0
        ? t(locale, "projectsPaymentPartial", {
            received: formatMoney(receivedTotal, locale),
            left: formatMoney(freelanceRemaining, locale),
          })
        : t(locale, "projectsPaymentReceived", {
            amount: formatMoney(receivedTotal, locale),
          })
      : null;

  return (
    <div className="space-y-1.5 rounded-lg border border-border/80 p-2.5">
      <div className="flex items-start gap-2">
        <AssetIcon type={asset.type} />
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-tight">{asset.name}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
            {asset.capitalValue > 0 ? (
              <span className="text-muted-foreground">
                {t(locale, "bizAssetCapital")}: {formatMoney(asset.capitalValue, locale)}
              </span>
            ) : null}
            {asset.type === "rental" && utilities > 0 ? (
              <>
                <span className="text-muted-foreground">
                  {t(locale, "projectsAssetPlanGross", {
                    amount: formatMoney(asset.monthlyNet, locale),
                    perMonth: t(locale, "bizPerMonth"),
                  })}
                </span>
                <span className="text-amber-800 dark:text-amber-300">
                  {t(locale, "projectsAssetUtilities", {
                    amount: formatMoney(utilities, locale),
                  })}
                </span>
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  {t(locale, "projectsAssetNetAfterUtilities", {
                    amount: formatMoney(netMonthly, locale),
                    perMonth: t(locale, "bizPerMonth"),
                  })}
                </span>
              </>
            ) : asset.type === "freelance" ? (
              freelanceStatus ? (
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  {freelanceStatus}
                </span>
              ) : asset.monthlyNet > 0 ? (
                <span className="text-emerald-700 dark:text-emerald-400">
                  {t(locale, "bizAssetExpected")}: {formatMoney(asset.monthlyNet, locale)}
                </span>
              ) : null
            ) : (
              <span className="text-emerald-700 dark:text-emerald-400">
                +{formatMoney(asset.monthlyNet, locale)}/{t(locale, "bizPerMonth")}
              </span>
            )}
            {yieldPct > 0 ? (
              <span className="font-medium text-primary">
                {yieldPct}% {t(locale, "bizPerYear")}
              </span>
            ) : null}
            {effectiveHourly > 0 ? (
              <span className="font-medium text-foreground">
                {formatMoney(effectiveHourly, locale)}/{t(locale, "bizPerHour")}
              </span>
            ) : null}
          </div>
          {receivedTotal > 0 && asset.type !== "freelance" ? (
            <p className="mt-1 text-[10px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {t(locale, "projectsReceivedTotal", { amount: formatMoney(receivedTotal, locale) })}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-0.5">
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-7 px-2 text-[10px]"
            onClick={onTransfer}
          >
            {t(locale, "projectsToFamily")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={t(locale, "bizUnitEdit")}
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            aria-label={t(locale, "txDelete")}
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {asset.type === "rental" ? (
        <RentalUtilitiesHistory asset={asset} locale={locale} compact />
      ) : null}
      <PassiveReceiptHistory receipts={receipts} assetId={asset.id} locale={locale} />
    </div>
  );
}

function AssetTypeSection({
  type,
  assets,
  locale,
  receipts,
  onTransfer,
  onEdit,
  onRemove,
}: {
  type: BusinessAssetType;
  assets: BusinessAsset[];
  locale: "ru" | "en";
  receipts: ReturnType<typeof useBusinessStore.getState>["passiveReceipts"];
  onTransfer: (asset: BusinessAsset) => void;
  onEdit: (asset: BusinessAsset) => void;
  onRemove: (asset: BusinessAsset) => void;
}) {
  if (assets.length === 0) return null;
  const visibleAssets =
    type === "freelance" ? sortFreelanceAssetsByPaymentStatus(assets, receipts) : assets;
  const summary = typeAssetsSummary(assets, type);
  const receivedForType =
    type === "freelance"
      ? assets.reduce((sum, asset) => sum + passiveReceivedTotal(receipts, asset.id), 0)
      : 0;
  const freelanceRemaining = Math.max(0, summary.monthlyNet - receivedForType);
  const simpleSummary =
    type === "freelance"
      ? receivedForType > 0 && freelanceRemaining <= 0
        ? t(locale, "bizProjectSummaryPaid", {
            count: String(assets.length),
            amount: formatMoney(receivedForType, locale),
          })
        : receivedForType > 0
          ? t(locale, "bizProjectSummaryPartial", {
              count: String(assets.length),
              received: formatMoney(receivedForType, locale),
              left: formatMoney(freelanceRemaining, locale),
            })
          : t(locale, "bizProjectSummary", {
              count: String(assets.length),
              amount: formatMoney(summary.monthlyNet, locale),
            })
      : `+${formatMoney(summary.monthlyNet, locale)}/${t(locale, "bizPerMonth")}`;
  const isMainSource = true;
  const headerClass = isMainSource
    ? "flex items-center justify-between gap-2 rounded-lg border border-emerald-500/35 bg-emerald-600 px-2.5 py-1.5 text-white shadow-sm shadow-emerald-900/10"
    : "flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5";
  const summaryClass = isMainSource
    ? "text-right text-[11px] tabular-nums text-white/90"
    : "text-right text-[11px] tabular-nums text-muted-foreground";

  return (
    <div className="space-y-2">
      <div className={headerClass}>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <AssetIcon type={type} className={isMainSource ? "text-white" : "text-primary"} />
          {assetTypeLabel(type, locale)}
        </p>
        <span className={summaryClass}>
          {summary.capital > 0
            ? t(locale, "bizTypeSummary", {
                capital: formatMoney(summary.capital, locale),
                monthly: formatMoney(summary.monthlyNet, locale),
                yield: String(summary.yieldPct),
              })
            : simpleSummary}
        </span>
      </div>
      {visibleAssets.map((a) => (
        <AssetRow
          key={a.id}
          asset={a}
          locale={locale}
          receipts={receipts}
          receivedTotal={passiveReceivedTotal(receipts, a.id)}
          onTransfer={() => onTransfer(a)}
          onEdit={() => onEdit(a)}
          onRemove={() => onRemove(a)}
        />
      ))}
    </div>
  );
}

export function BusinessProjectsSection() {
  const locale = useStore((s) => s.locale);
  const assets = useBusinessStore((s) => s.assets);
  const receipts = useBusinessStore((s) => s.passiveReceipts);
  const addAsset = useBusinessStore((s) => s.addAsset);
  const removeAsset = useBusinessStore((s) => s.removeAsset);
  const updateAsset = useBusinessStore((s) => s.updateAsset);
  const sellAssetToFamily = useBusinessStore((s) => s.sellAssetToFamily);
  const setAssetUtilitiesMonth = useBusinessStore((s) => s.setAssetUtilitiesMonth);
  const transferPassiveToFamily = useBusinessStore((s) => s.transferPassiveToFamily);
  const ensureProjectsUnitId = useBusinessStore((s) => s.ensureProjectsUnitId);
  const { toast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<BusinessAsset | null>(null);
  const [transferAsset, setTransferAsset] = useState<BusinessAsset | null>(null);
  const [assetType, setAssetType] = useState<BusinessAssetType>("freelance");
  const [assetName, setAssetName] = useState("");
  const [assetCapital, setAssetCapital] = useState("");
  const [assetMonthly, setAssetMonthly] = useState("");
  const [assetHours, setAssetHours] = useState("");
  const [editName, setEditName] = useState("");
  const [editCapital, setEditCapital] = useState("");
  const [editMonthly, setEditMonthly] = useState("");
  const [editHours, setEditHours] = useState("");
  const [editUtilities, setEditUtilities] = useState("");
  const [editUtilitiesMonth, setEditUtilitiesMonth] = useState(() => currentUtilitiesMonthKey());
  const [saleAmount, setSaleAmount] = useState("");
  const [showProjectsHow, setShowProjectsHow] = useState(false);

  useEffect(() => {
    try {
      setShowProjectsHow(localStorage.getItem(PROJECTS_HOW_HIDDEN_KEY) !== "1");
    } catch {
      setShowProjectsHow(true);
    }
  }, []);

  const assetsByType = useMemo(() => groupAssetsByType(assets, null), [assets]);
  const hasAssets =
    assetsByType.investment.length +
      assetsByType.rental.length +
      assetsByType.freelance.length >
    0;

  const submitAdd = () => {
    if (!assetName.trim()) {
      toast(t(locale, "bizAssetNameRequired"), "error");
      return;
    }
    const cap = assetType === "freelance" ? 0 : parseMoneyAmount(assetCapital) ?? 0;
    const monthly = parseMoneyAmount(assetMonthly) ?? 0;
    const hours = parseMoneyAmount(assetHours) ?? undefined;
    addAsset(ensureProjectsUnitId(), assetType, assetName, cap, monthly, hours);
    setAddOpen(false);
    setAssetName("");
    setAssetCapital("");
    setAssetMonthly("");
    setAssetHours("");
    toast(t(locale, "bizAssetSaved"), "success");
  };

  const openEdit = (a: BusinessAsset) => {
    setEditAsset(a);
    setEditName(a.name);
    setEditCapital(String(a.capitalValue || ""));
    setEditMonthly(String(a.monthlyNet || ""));
    setEditHours(String(a.hoursPerMonth || ""));
    setEditUtilitiesMonth(currentUtilitiesMonthKey());
    const utils = utilitiesAmountForMonth(a, currentUtilitiesMonthKey());
    setEditUtilities(utils > 0 ? String(utils) : "");
    setSaleAmount("");
  };

  const submitEdit = () => {
    if (!editAsset || !editName.trim()) return;
    updateAsset(editAsset.id, {
      name: editName,
      capitalValue:
        editAsset.type === "freelance" ? 0 : parseMoneyAmount(editCapital) ?? 0,
      monthlyNet: parseMoneyAmount(editMonthly) ?? 0,
      hoursPerMonth: parseMoneyAmount(editHours) ?? 0,
    });
    if (editAsset.type === "rental") {
      const utilitiesRub = parseMoneyAmount(editUtilities) ?? 0;
      setAssetUtilitiesMonth(editAsset.id, editUtilitiesMonth, utilitiesRub);
    }
    setEditAsset(null);
    toast(t(locale, "bizSave"), "success");
  };

  const confirmRemoveAsset = (asset: BusinessAsset) => {
    if (!window.confirm(t(locale, "bizAssetDeleteConfirm", { name: asset.name }))) return;
    removeAsset(asset.id);
    toast(t(locale, "bizAssetDeleted"), "success");
  };

  const confirmSellAsset = () => {
    if (!editAsset) return;
    const amount = parseMoneyAmount(saleAmount);
    if (!amount || amount <= 0) {
      toast(locale === "ru" ? "Укажите сумму продажи" : "Enter sale amount", "error");
      return;
    }
    if (!sellAssetToFamily(editAsset.id, amount)) {
      toast(locale === "ru" ? "Не удалось записать продажу" : "Could not record sale", "error");
      return;
    }
    setEditAsset(null);
    setSaleAmount("");
    toast(
      locale === "ru"
        ? `Продажа записана: ${formatMoney(amount, locale)}`
        : `Sale recorded: ${formatMoney(amount, locale)}`,
      "success",
    );
  };

  const confirmTransfer = (amount: number, date: string) => {
    if (!transferAsset) return;
    if (!transferPassiveToFamily(transferAsset.id, amount, date)) {
      toast(t(locale, "projectsTransferFail"), "error");
      return;
    }
    toast(
      t(locale, "projectsTransferOk", { amount: formatMoney(amount, locale) }),
      "success",
    );
    setTransferAsset(null);
  };

  const hideProjectsHow = () => {
    setShowProjectsHow(false);
    try {
      localStorage.setItem(PROJECTS_HOW_HIDDEN_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-primary" aria-hidden />
            {t(locale, "bizAssetsTitle")}
          </CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            {t(locale, "bizAssetAdd")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {showProjectsHow ? (
            <div className="relative rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 pr-9 text-[11px] leading-relaxed">
              <p className="font-medium text-foreground">{t(locale, "bizProjectsHowTitle")}</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>{t(locale, "bizProjectsHow1")}</li>
                <li>{t(locale, "bizProjectsHow2")}</li>
                <li>{t(locale, "bizProjectsHow3")}</li>
              </ul>
              <button
                type="button"
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
                onClick={hideProjectsHow}
                aria-label={t(locale, "bizHowDismiss")}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ) : null}
          {!hasAssets ? (
            <p className="text-xs text-muted-foreground">{t(locale, "bizAssetsEmpty")}</p>
          ) : (
            <>
              <AssetTypeSection
                type="freelance"
                assets={assetsByType.freelance}
                locale={locale}
                receipts={receipts}
                onTransfer={setTransferAsset}
                onEdit={openEdit}
                onRemove={confirmRemoveAsset}
              />
              <AssetTypeSection
                type="investment"
                assets={assetsByType.investment}
                locale={locale}
                receipts={receipts}
                onTransfer={setTransferAsset}
                onEdit={openEdit}
                onRemove={confirmRemoveAsset}
              />
              <AssetTypeSection
                type="rental"
                assets={assetsByType.rental}
                locale={locale}
                receipts={receipts}
                onTransfer={setTransferAsset}
                onEdit={openEdit}
                onRemove={confirmRemoveAsset}
              />
            </>
          )}
        </CardContent>
      </Card>

      <PassiveTransferDialog
        asset={transferAsset}
        open={transferAsset !== null}
        onOpenChange={(open) => {
          if (!open) setTransferAsset(null);
        }}
        onConfirm={confirmTransfer}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t(locale, "bizAssetAdd")}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t(locale, "bizAssetDialogHint")}</p>
          <div className="flex gap-2">
            {(["freelance", "rental", "investment"] as BusinessAssetType[]).map((kind) => (
              <Button
                key={kind}
                type="button"
                size="sm"
                variant={assetType === kind ? "default" : "outline"}
                className="flex-1 text-[11px]"
                onClick={() => setAssetType(kind)}
              >
                {assetTypeLabel(kind, locale)}
              </Button>
            ))}
          </div>
          <Input
            placeholder={t(locale, "bizAssetNamePh")}
            value={assetName}
            onChange={(e) => setAssetName(e.target.value)}
          />
          {assetType !== "freelance" ? (
            <Input
              type="text"
              inputMode="decimal"
              placeholder={t(locale, "bizAssetCapitalPh")}
              value={assetCapital}
              onChange={(e) => setAssetCapital(e.target.value)}
            />
          ) : null}
          <Input
            type="text"
            inputMode="decimal"
            placeholder={t(
              locale,
              assetType === "freelance" ? "bizAssetExpectedPh" : "bizAssetMonthlyPh",
            )}
            value={assetMonthly}
            onChange={(e) => setAssetMonthly(e.target.value)}
          />
          {assetType === "freelance" ? (
            <Input
              type="text"
              inputMode="numeric"
              placeholder={t(locale, "bizAssetHoursPh")}
              value={assetHours}
              onChange={(e) => setAssetHours(e.target.value)}
            />
          ) : null}
          <Button type="button" className="w-full" onClick={submitAdd}>
            {t(locale, "bizSave")}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={editAsset !== null} onOpenChange={(o) => !o && setEditAsset(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t(locale, "projectsEditPlan")}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t(locale, "bizAssetDialogHint")}</p>
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          {editAsset?.type !== "freelance" ? (
            <Input
              placeholder={t(locale, "bizAssetCapitalPh")}
              value={editCapital}
              onChange={(e) => setEditCapital(e.target.value)}
            />
          ) : null}
          <Input
            placeholder={t(
              locale,
              editAsset?.type === "freelance" ? "bizAssetExpectedPh" : "bizAssetMonthlyPh",
            )}
            value={editMonthly}
            onChange={(e) => setEditMonthly(e.target.value)}
          />
          {editAsset?.type === "freelance" ? (
            <Input
              placeholder={t(locale, "bizAssetHoursPh")}
              value={editHours}
              onChange={(e) => setEditHours(e.target.value)}
            />
          ) : null}
          {editAsset?.type === "rental" ? (
            <>
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {t(locale, "projectsUtilitiesMonthField")}
                </span>
                <Input
                  type="month"
                  value={editUtilitiesMonth}
                  onChange={(e) => {
                    const mk = e.target.value;
                    setEditUtilitiesMonth(mk);
                    const amt = utilitiesAmountForMonth(editAsset, mk);
                    setEditUtilities(amt > 0 ? String(amt) : "");
                  }}
                />
              </label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder={t(locale, "projectsUtilitiesPh")}
                value={editUtilities}
                onChange={(e) => setEditUtilities(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">{t(locale, "projectsUtilitiesHint")}</p>
              <RentalUtilitiesHistory asset={editAsset} locale={locale} />
            </>
          ) : null}
          {editAsset ? (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-50 px-3 py-2 dark:bg-emerald-950/20">
              <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
                {locale === "ru" ? "Продажа актива" : "Asset sale"}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                {locale === "ru"
                  ? "Запишет доход в бизнес и уберёт актив из списка."
                  : "Records business income and removes the asset from the list."}
              </p>
              <div className="mt-2 flex gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder={locale === "ru" ? "Сумма продажи" : "Sale amount"}
                  value={saleAmount}
                  onChange={(e) => setSaleAmount(e.target.value)}
                />
                <Button type="button" variant="default" onClick={confirmSellAsset}>
                  {locale === "ru" ? "Продать" : "Sell"}
                </Button>
              </div>
            </div>
          ) : null}
          <Button type="button" className="w-full" onClick={submitEdit}>
            {t(locale, "bizSave")}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
