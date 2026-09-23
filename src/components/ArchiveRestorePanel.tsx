"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArchiveRestore, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  apiSync,
  apiCreateHouseholdBackup,
  apiListHouseholdBackups,
  apiRestoreHouseholdBackup,
  type HouseholdBackupSummary,
} from "@/lib/cloud/client";
import { applyHouseholdSync } from "@/lib/cloud/apply-sync";
import { isCloudPaused, setCloudPaused } from "@/lib/cloud/cloud-pause";
import { beginCloudRestore, endCloudRestore } from "@/lib/cloud/restore-lock";
import type { SyncPayload } from "@/lib/household/types";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";
import { downloadTextFile } from "@/lib/export/transactions-export";

function formatArchiveDate(value: string, locale: "ru" | "en"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function formatArchiveTime(value: string, locale: "ru" | "en"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function archiveDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function groupArchiveItems<T>(
  items: T[],
  getDate: (item: T) => string,
): { key: string; date: string; items: T[] }[] {
  const groups = new Map<string, { key: string; date: string; items: T[] }>();
  for (const item of items) {
    const date = getDate(item);
    const key = archiveDayKey(date);
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
    } else {
      groups.set(key, { key, date, items: [item] });
    }
  }
  return Array.from(groups.values());
}

function backupReasonLabel(reason: string, locale: "ru" | "en"): string {
  const ru: Record<string, string> = {
    manual: "создано вручную",
    daily_21_msk: "ежедневная копия 21:00",
    before_update: "перед обновлением",
    before_restore: "перед восстановлением",
    first_save: "первая копия",
    protected_empty_overwrite: "защита от пустой перезаписи",
  };
  const en: Record<string, string> = {
    manual: "manual",
    daily_21_msk: "daily 21:00 backup",
    before_update: "before update",
    before_restore: "before restore",
    first_save: "first save",
    protected_empty_overwrite: "empty overwrite protection",
  };
  return (locale === "ru" ? ru : en)[reason] ?? reason.replaceAll("_", " ");
}

function ContentLine({
  items,
}: {
  items: Array<string | false | null | undefined>;
}) {
  const visible = items.filter(Boolean) as string[];
  if (visible.length === 0) return null;
  return (
    <p className="mt-0.5 break-words text-xs text-muted-foreground">
      {visible.join(" · ")}
    </p>
  );
}

function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-primary/15 bg-primary/10 px-2.5 py-2">
      <p className="min-w-0 break-words text-xs font-bold uppercase tracking-wide text-primary">
        {title}
      </p>
      {action}
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
  const categoryArchive = useStore((s) => s.deletedCategoryArchive);
  const restoreArchivedCategory = useStore((s) => s.restoreArchivedCategory);
  const token = useCloudStore((s) => s.token);
  const [householdBackups, setHouseholdBackups] = useState<HouseholdBackupSummary[]>([]);
  const [householdLoading, setHouseholdLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [creatingHouseholdBackup, setCreatingHouseholdBackup] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasArchive = categoryArchive.length > 0 || householdBackups.length > 0;
  const totalBackups = categoryArchive.length + householdBackups.length;

  const loadServerBackups = useCallback(async () => {
    if (!token) {
      setHouseholdBackups([]);
      return;
    }
    setHouseholdLoading(true);
    try {
      const householdRes = await apiListHouseholdBackups(token);
      setHouseholdBackups(householdRes.backups ?? []);
    } catch {
      setHouseholdBackups([]);
    } finally {
      setHouseholdLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadServerBackups();
  }, [loadServerBackups]);

  const restoreCategory = (id: string) => {
    const ok = restoreArchivedCategory(id);
    toast(
      ok
        ? locale === "ru"
          ? "Категория восстановлена"
          : "Category restored"
        : locale === "ru"
          ? "Не удалось восстановить категорию"
          : "Could not restore category",
      ok ? "success" : "error",
    );
  };



  const buildLocalHouseholdSnapshot = (): SyncPayload | null => {
    const cloud = useCloudStore.getState();
    const household = cloud.household;
    if (!household) return null;
    const local = useStore.getState();
    return {
      household,
      memberUserIds: cloud.householdMemberUserIds.length
        ? cloud.householdMemberUserIds
        : [],
      transactions: local.transactions,
      categories: local.categories,
      savingsGoals: local.savingsGoals,
      categoryBudgets: local.categoryBudgets,
      recurringTransactions: local.recurringTransactions,
      debts: local.debts,
      moneySetup: local.moneySetup,
      balanceOffsets: {},
      vehicles: local.vehicles,
      vehiclePrefs: local.vehiclePrefs,
      vehicleGarageAvailable: true,
    };
  };

  const buildHouseholdSnapshot = async (): Promise<SyncPayload | null> => {
    const localSnapshot = buildLocalHouseholdSnapshot();
    const tokenValue = token;
    if (!localSnapshot || !tokenValue) return localSnapshot;
    try {
      const res = await apiSync(tokenValue);
      return res.sync;
    } catch {
      return localSnapshot;
    }
  };

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
    downloadTextFile(`finos-personal-backup-${stamp}.json`, JSON.stringify(backup, null, 2), "application/json");
    toast(locale === "ru" ? "Личная резервная копия сохранена в файл." : "Personal backup saved as a file.", "success");
  };

  const restorePersonalBackupFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isPersonalFileBackup(parsed)) throw new Error("invalid_backup");
      if (!window.confirm(locale === "ru" ? "Восстановить личные данные из файла? Текущие данные на этом устройстве будут заменены." : "Restore personal data from this file? Current data on this device will be replaced.")) return;
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
      toast(locale === "ru" ? "Не удалось прочитать резервную копию. Выберите файл FinOS .json." : "Could not read this backup. Choose a FinOS .json file.", "error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const createHouseholdBackup = async () => {
    if (!token) return;
    setCreatingHouseholdBackup(true);
    try {
      const res = await apiCreateHouseholdBackup(token, await buildHouseholdSnapshot());
      setHouseholdBackups(res.backups ?? []);
      toast(
        locale === "ru" ? "Копия семьи создана" : "Household backup created",
        "success",
      );
    } catch {
      toast(
        locale === "ru" ? "Не удалось создать копию семьи" : "Could not create household backup",
        "error",
      );
    } finally {
      setCreatingHouseholdBackup(false);
    }
  };


  const restoreHouseholdServerBackup = async (id: string) => {
    if (!token) return;
    if (
      !window.confirm(
        locale === "ru"
          ? "Восстановить семью из этой резервной копии? Текущие операции, цели и категории перед восстановлением тоже сохранятся в архив."
          : "Restore household from this backup? Current entries, goals, and categories will also be saved as a backup.",
      )
    ) {
      return;
    }
    setRestoringId(id);
    const wasCloudPaused = isCloudPaused();
    beginCloudRestore();
    setCloudPaused(true);
    try {
      const res = await apiRestoreHouseholdBackup(token, id);
      useCloudStore.getState().setDeletedTransactionIds([]);
      useCloudStore.getState().setDeletedRecurringIds([]);
      useCloudStore.getState().setDeletedDebtIds([]);
      applyHouseholdSync(res.sync, token, { replace: true });
      toast(
        locale === "ru" ? "Семья восстановлена из резервной копии" : "Household restored from backup",
        "success",
      );
      await loadServerBackups();
    } catch {
      toast(
        locale === "ru" ? "Не удалось восстановить семью" : "Could not restore household backup",
        "error",
      );
    } finally {
      setCloudPaused(wasCloudPaused);
      endCloudRestore();
      setRestoringId(null);
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-3 overflow-hidden rounded-lg border-2 border-primary/25 bg-primary/5 p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <ArchiveRestore className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-bold leading-tight text-foreground">
              {locale === "ru" ? "Резервные копии и восстановление" : "Backups and restore"}
            </p>
            {totalBackups > 0 ? (
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                {locale === "ru" ? `${totalBackups} коп.` : `${totalBackups} saved`}
              </span>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {locale === "ru"
              ? "Здесь можно вернуть личные операции, цели или категории, если что-то удалилось или пошло не так."
              : "Restore personal entries, goals, or categories if something was deleted or went wrong."}
          </p>
        </div>
      </div>

      {!hasArchive ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          {householdLoading
            ? locale === "ru"
              ? "Проверяю резервные копии..."
              : "Checking backups..."
            : locale === "ru"
              ? "Архив пока пуст."
              : "Archive is empty."}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <SectionTitle title={locale === "ru" ? "Файл на телефон" : "File on this device"} />
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
          onChange={(event) => void restorePersonalBackupFile(event.target.files?.[0])}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button type="button" variant="secondary" onClick={downloadPersonalBackupFile}>
            {locale === "ru" ? "Сохранить JSON-файл" : "Save JSON file"}
          </Button>
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
            {locale === "ru" ? "Восстановить из файла" : "Restore from file"}
          </Button>
        </div>
      </div>

      {token ? (
        <div className="space-y-1.5">
          <SectionTitle
            title={locale === "ru" ? "Семья: операции, цели, долги" : "Household: entries, goals, debts"}
            action={
              <Button
                size="sm"
                variant="secondary"
                className="h-7 px-2 text-xs"
                disabled={creatingHouseholdBackup}
                onClick={() => void createHouseholdBackup()}
              >
                {creatingHouseholdBackup ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : locale === "ru" ? (
                  "Создать копию"
                ) : (
                  "Create copy"
                )}
              </Button>
            }
          />
          {householdBackups.length > 0 ? (
            <div className="max-h-60 max-w-full space-y-1.5 overflow-y-auto overflow-x-hidden pr-1">
              {groupArchiveItems(householdBackups, (item) => item.createdAt).map((group) => (
                <div key={group.key} className="space-y-1.5">
                  <p className="px-1 text-[11px] font-medium text-muted-foreground">
                    {formatArchiveDate(group.date, locale)}
                  </p>
                  {group.items.map((item) => (
                    <div key={item.id} className="min-w-0 rounded-md border px-2.5 py-2 text-sm">
                      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="break-words font-medium leading-tight">
                            {formatArchiveTime(item.createdAt, locale)} · {backupReasonLabel(item.reason, locale)}
                          </p>
                          <ContentLine
                            items={[
                              `${locale === "ru" ? "Операции" : "Entries"}: ${item.transactions}`,
                              `${locale === "ru" ? "Цели" : "Goals"}: ${item.goals}`,
                              `${locale === "ru" ? "Категории" : "Categories"}: ${item.categories}`,
                              `${locale === "ru" ? "Регулярные" : "Recurring"}: ${item.recurring}`,
                              `${locale === "ru" ? "Долги" : "Debts"}: ${item.debts}`,
                              item.vehicles > 0 && `${locale === "ru" ? "Авто" : "Cars"}: ${item.vehicles}`,
                            ]}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full sm:w-auto"
                          disabled={Boolean(restoringId)}
                          onClick={() => void restoreHouseholdServerBackup(item.id)}
                        >
                          {restoringId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : locale === "ru" ? (
                            "Вернуть"
                          ) : (
                            "Restore"
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : householdLoading ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              {locale === "ru" ? "Проверяю копии семьи..." : "Checking household backups..."}
            </p>
          ) : null}
        </div>
      ) : null}


      {categoryArchive.length > 0 ? (
        <div className="space-y-1.5">
          <SectionTitle title={locale === "ru" ? "Удалённые категории" : "Deleted categories"} />
          <div className="max-h-60 max-w-full space-y-1.5 overflow-y-auto overflow-x-hidden pr-1">
            {groupArchiveItems(categoryArchive, (item) => item.deletedAt).map((group) => (
              <div key={group.key} className="space-y-1.5">
                <p className="px-1 text-[11px] font-medium text-muted-foreground">
                  {formatArchiveDate(group.date, locale)}
                </p>
                {group.items.map((item) => (
                  <div key={item.id} className="min-w-0 rounded-md border px-2.5 py-2 text-sm">
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="break-words font-medium leading-tight">{item.category.labels.ru}</p>
                        <p className="mt-0.5 break-words text-xs text-muted-foreground">
                          {formatArchiveTime(item.deletedAt, locale)} ·{" "}
                          {locale === "ru" ? "операций: " : "entries: "}
                          {item.affectedTransactions.length}
                        </p>
                        {item.category.keywords.length > 0 ? (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {item.category.keywords.slice(0, 6).join(", ")}
                          </p>
                        ) : null}
                      </div>
                      <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => restoreCategory(item.id)}>
                        {locale === "ru" ? "Вернуть" : "Restore"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

    </div>
  );
}
