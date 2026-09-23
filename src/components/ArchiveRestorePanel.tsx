"use client";

import { useRef } from "react";
import { ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setCloudPaused } from "@/lib/cloud/cloud-pause";
import { beginCloudRestore, endCloudRestore } from "@/lib/cloud/restore-lock";
import type { SyncPayload } from "@/lib/household/types";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";
import { downloadTextFile } from "@/lib/export/transactions-export";

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-primary/15 bg-primary/10 px-2.5 py-2">
      <p className="min-w-0 break-words text-xs font-bold uppercase tracking-wide text-primary">
        {title}
      </p>
    </div>
  );
}

type PersonalFileBackup = {
  format: "finos-personal-backup";
  version: 1;
  createdAt: string;
  data: Pick<
    SyncPayload,
    | "transactions"
    | "categories"
    | "savingsGoals"
    | "categoryBudgets"
    | "recurringTransactions"
    | "debts"
    | "moneySetup"
    | "vehicles"
    | "vehiclePrefs"
  >;
};

function isPersonalFileBackup(value: unknown): value is PersonalFileBackup {
  if (!value || typeof value !== "object") return false;
  const backup = value as Partial<PersonalFileBackup>;
  const data = backup.data;
  return (
    backup.format === "finos-personal-backup" &&
    backup.version === 1 &&
    Boolean(data) &&
    Array.isArray(data?.transactions) &&
    Array.isArray(data?.categories) &&
    Array.isArray(data?.savingsGoals) &&
    Array.isArray(data?.categoryBudgets) &&
    Array.isArray(data?.recurringTransactions)
  );
}

export function ArchiveRestorePanel() {
  const locale = useStore((s) => s.locale);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadPersonalBackupFile = () => {
    const local = useStore.getState();
    const backup: PersonalFileBackup = {
      format: "finos-personal-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      data: {
        transactions: local.transactions,
        categories: local.categories,
        savingsGoals: local.savingsGoals,
        categoryBudgets: local.categoryBudgets,
        recurringTransactions: local.recurringTransactions,
        debts: local.debts,
        moneySetup: local.moneySetup,
        vehicles: local.vehicles,
        vehiclePrefs: local.vehiclePrefs,
      },
    };
    const stamp = backup.createdAt.slice(0, 10);
    downloadTextFile(
      `finos-personal-backup-${stamp}.json`,
      JSON.stringify(backup, null, 2),
      "application/json",
    );
    toast(
      locale === "ru"
        ? "Личная резервная копия сохранена в файл."
        : "Personal backup saved as a file.",
      "success",
    );
  };

  const restorePersonalBackupFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isPersonalFileBackup(parsed)) throw new Error("invalid_backup");
      if (
        !window.confirm(
          locale === "ru"
            ? "Восстановить личные данные из файла? Текущие данные на этом устройстве будут заменены."
            : "Restore personal data from this file? Current data on this device will be replaced.",
        )
      )
        return;
      const data = parsed.data;
      beginCloudRestore();
      setCloudPaused(true);
      useStore.setState({
        transactions: data.transactions,
        categories: data.categories,
        savingsGoals: data.savingsGoals,
        categoryBudgets: data.categoryBudgets,
        recurringTransactions: data.recurringTransactions,
        debts: data.debts ?? [],
        moneySetup: data.moneySetup,
        vehicles: data.vehicles ?? [],
        vehiclePrefs: data.vehiclePrefs,
      });
      useCloudStore.getState().setDeletedTransactionIds([]);
      useCloudStore.getState().setDeletedRecurringIds([]);
      useCloudStore.getState().setDeletedDebtIds([]);
      toast(
        locale === "ru"
          ? "Личные данные восстановлены из файла. Синхронизация приостановлена, чтобы облако не перезаписало их."
          : "Personal data restored from file. Sync is paused so cloud data cannot overwrite it.",
        "success",
      );
      endCloudRestore();
    } catch {
      toast(
        locale === "ru"
          ? "Не удалось прочитать резервную копию. Выберите файл FinOS .json."
          : "Could not read this backup. Choose a FinOS .json file.",
        "error",
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-3 overflow-hidden rounded-lg border-2 border-primary/25 bg-primary/5 p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <ArchiveRestore className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-base font-bold leading-tight text-foreground">
            {locale === "ru" ? "Восстановление из файла" : "Restore from file"}
          </p>{" "}
        </div>
      </div>

      <div className="space-y-1.5">
        <SectionTitle
          title={locale === "ru" ? "Файл на телефон" : "File on this device"}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {locale === "ru"
            ? "Скачайте JSON-файл и храните его в надёжном месте. Восстановление работает без облачной синхронизации."
            : "Download a JSON file and keep it somewhere safe. Restore works without cloud sync."}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) =>
            void restorePersonalBackupFile(event.target.files?.[0])
          }
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="secondary"
            onClick={downloadPersonalBackupFile}
          >
            {locale === "ru" ? "Сохранить JSON-файл" : "Save JSON file"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            {locale === "ru" ? "Восстановить из файла" : "Restore from file"}
          </Button>
        </div>
      </div>
    </div>
  );
}
