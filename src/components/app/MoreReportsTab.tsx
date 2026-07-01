"use client";

import { ChevronDown, FileSpreadsheet, FileText, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiListAiReports, type AiReportRecord } from "@/lib/cloud/client";
import {
  buildBudgetExcelWorkbook,
  buildTransactionsPdfBlob,
  filterBusinessTransactionsByPeriod,
  filterTransactionsByPeriod,
  saveBlobFile,
} from "@/lib/export/transactions-export";
import { formatIsoPeriod } from "@/lib/format-date";
import { t } from "@/lib/i18n";
import { useBusinessStore } from "@/store/useBusinessStore";
import { useCloudStore } from "@/store/useCloudStore";
import { useCategories, useStore, useTransactions } from "@/store/useStore";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

function defaultPeriod(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function AiReportHistory({
  locale,
  kind,
  reports,
  loading,
}: {
  locale: "ru" | "en";
  kind: "weekly" | "monthly";
  reports: AiReportRecord[];
  loading: boolean;
}) {
  const filtered = reports.filter((r) => r.kind === kind);
  const [openId, setOpenId] = useState<string | null>(null);
  const dateLocale = locale === "ru" ? "ru-RU" : "en-GB";
  const grouped = filtered.reduce<Array<{ key: string; label: string; reports: AiReportRecord[] }>>(
    (acc, report) => {
      const createdAt = new Date(report.createdAt);
      const key = `${createdAt.getFullYear()}-${createdAt.getMonth()}-${createdAt.getDate()}`;
      let group = acc.find((item) => item.key === key);

      if (!group) {
        group = {
          key,
          label: new Intl.DateTimeFormat(dateLocale, {
            day: "numeric",
            month: "long",
            year: "numeric",
          }).format(createdAt),
          reports: [],
        };
        acc.push(group);
      }

      group.reports.push(report);
      return acc;
    },
    [],
  );

  if (loading) {
    return <p className="text-xs text-muted-foreground">{t(locale, "moreReportsHistoryLoading")}</p>;
  }

  if (filtered.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
        {t(locale, "moreReportsHistoryEmpty")}
      </p>
    );
  }

  return (
    <ul className="max-h-64 space-y-3 overflow-y-auto pr-1">
      {grouped.map((group) => (
        <li key={group.key} className="space-y-1.5">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label}
          </p>
          <ul className="space-y-2">
            {group.reports.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-border/70 bg-muted/20 text-sm"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                  onClick={() => setOpenId((current) => (current === r.id ? null : r.id))}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-foreground">
                      {new Intl.DateTimeFormat(dateLocale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(r.createdAt))}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {formatIsoPeriod(r.periodStart, r.periodEnd, locale)}
                      {r.fallback ? ` · ${t(locale, "moreReportsFallback")}` : ""}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      openId === r.id && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
                {openId === r.id ? (
                  <ul className="space-y-1 px-3 pb-3 text-xs leading-snug">
                    {r.tips.map((tip, i) => (
                      <li key={`${r.id}-${i}`} className="rounded bg-primary/5 px-2 py-1">
                        {tip}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function MoreReportsTab() {
  const locale = useStore((s) => s.locale);
  const transactions = useTransactions();
  const categories = useCategories();
  const businessTransactions = useBusinessStore((s) => s.transactions);
  const businessUnits = useBusinessStore((s) => s.units);
  const businessAssets = useBusinessStore((s) => s.assets);
  const token = useCloudStore((s) => s.token);
  const [period, setPeriod] = useState(defaultPeriod);
  const [reports, setReports] = useState<AiReportRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [tableReady, setTableReady] = useState(true);
  const [historyKind, setHistoryKind] = useState<"weekly" | "monthly">("weekly");
  const [preparedFile, setPreparedFile] = useState<{
    type: "xlsx" | "pdf";
    url: string;
    fileName: string;
  } | null>(null);
  const { toast } = useToast();

  const periodTxs = useMemo(
    () => filterTransactionsByPeriod(transactions, period.from, period.to),
    [transactions, period.from, period.to],
  );
  const periodBusinessTxs = useMemo(
    () => filterBusinessTransactionsByPeriod(businessTransactions, period.from, period.to),
    [businessTransactions, period.from, period.to],
  );
  const exportCount = periodTxs.length + periodBusinessTxs.length + businessAssets.length;

  const loadHistory = useCallback(async () => {
    if (!token) {
      setReports([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const res = await apiListAiReports(token);
      setReports(res.reports ?? []);
      setTableReady(res.tableReady !== false);
    } catch {
      setReports([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const id = window.setInterval(() => void loadHistory(), 30_000);
    return () => window.clearInterval(id);
  }, [loadHistory]);

  const showSaveResult = (result: "shared" | "downloaded" | "opened" | "failed") => {
    if (result === "failed") {
      toast(
        locale === "ru"
          ? "Телефон не дал сохранить файл. Попробуйте открыть приложение во внешнем браузере."
          : "The phone did not allow saving the file. Try opening the app in an external browser.",
        "error",
      );
      return;
    }
    toast(
      result === "shared"
        ? locale === "ru"
          ? "Файл готов — выберите, куда сохранить или отправить."
          : "File is ready — choose where to save or send it."
        : locale === "ru"
          ? "Файл сформирован. Если скачивание не видно — проверьте загрузки браузера."
          : "File created. If you do not see it, check browser downloads.",
      "success",
    );
  };

  const blobToBase64 = async (blob: Blob): Promise<string> => {
    const buffer = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
    }
    return window.btoa(binary);
  };

  const prepareBlobFile = async (
    filename: string,
    blob: Blob,
  ): Promise<{ url: string; fileName: string } | null> => {
    if (!token) return null;
    try {
      const res = await fetch("/api/reports/file", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename,
          mime: blob.type || "application/octet-stream",
          base64: await blobToBase64(blob),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      if (!res.ok || !data.id) return null;
      const params = new URLSearchParams({ id: data.id, token });
      const url = `${window.location.origin}/api/reports/file?${params.toString()}`;
      return { url, fileName: filename };
    } catch {
      return null;
    }
  };

  const downloadPreparedBlob = async (filename: string, blob: Blob): Promise<boolean> => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.downloadFile) return false;
    const prepared = await prepareBlobFile(filename, blob);
    if (!prepared) return false;
    try {
      const { url, fileName } = prepared;
      tg.downloadFile({ url, file_name: filename }, (accepted) => {
        toast(
          accepted
            ? locale === "ru"
              ? "Telegram начал скачивание файла."
              : "Telegram started downloading the file."
            : locale === "ru"
              ? "Telegram не дал скачать файл. Открою ссылку."
              : "Telegram did not allow downloading. Opening the file link.",
          accepted ? "success" : "default",
        );
        if (!accepted) {
          setPreparedFile({ type: filename.endsWith(".pdf") ? "pdf" : "xlsx", url, fileName });
          window.open(url, "_blank", "noopener,noreferrer");
        }
      });
      return true;
    } catch {
      return false;
    }
  };

  const openServerExport = (
    type: "xlsx" | "pdf",
    options: { direct?: boolean } = {},
  ) => {
    if (!token) return false;
    const fileName = `prosto-budget-${period.from}_${period.to}.${type}`;
    const params = new URLSearchParams({
      type,
      from: period.from,
      to: period.to,
      locale,
      token,
    });
    const url = `${window.location.origin}/api/reports/export?${params.toString()}`;
    if (options.direct) {
      setPreparedFile({ type, url, fileName });
      toast(
        locale === "ru"
          ? "PDF готов. Если файл не открылся сам — нажмите кнопку ниже."
          : "PDF is ready. If it did not open automatically, tap the button below.",
        "default",
      );
      const tg = window.Telegram?.WebApp;
      if (tg?.openLink) {
        try {
          tg.openLink(url, { try_instant_view: false });
          return true;
        } catch {
          /* fallback below */
        }
      }
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      return true;
    }

    const tg = window.Telegram?.WebApp;
    if (tg?.downloadFile) {
      try {
        tg.downloadFile({ url, file_name: fileName }, (accepted) => {
          toast(
            accepted
              ? locale === "ru"
                ? "Telegram начал скачивание файла."
                : "Telegram started downloading the file."
              : locale === "ru"
                ? "Telegram не дал скачать файл. Открою ссылку в браузере."
                : "Telegram did not allow downloading. Opening the file link.",
            accepted ? "success" : "default",
          );
          if (!accepted) window.open(url, "_blank", "noopener,noreferrer");
        });
        return true;
      } catch {
        /* fallback below */
      }
    }

    toast(
      locale === "ru"
        ? "Открываю файл ссылкой. Если Telegram спросит — выберите «Скачать» или «Поделиться»."
        : "Opening file link. If Telegram asks, choose Download or Share.",
      "default",
    );
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = url;
    return true;
  };

  const openPreparedFile = () => {
    if (!preparedFile) return;
    const tg = window.Telegram?.WebApp;
    if (tg?.openLink) {
      try {
        tg.openLink(preparedFile.url, { try_instant_view: false });
        return;
      } catch {
        /* fallback below */
      }
    }
    const opened = window.open(preparedFile.url, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = preparedFile.url;
  };

  const exportExcel = async () => {
    const workbook = buildBudgetExcelWorkbook({
      transactions: periodTxs,
      categories,
      businessTransactions: periodBusinessTxs,
      businessUnits,
      businessAssets,
      locale,
      periodStart: period.from,
      periodEnd: period.to,
    });
    const fileName = `prosto-budget-${period.from}_${period.to}.xlsx`;
    const blob = new Blob(
      [
        workbook.buffer.slice(
          workbook.byteOffset,
          workbook.byteOffset + workbook.byteLength,
        ) as ArrayBuffer,
      ],
      {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    );
    if (await downloadPreparedBlob(fileName, blob)) return;

    const result = await saveBlobFile(
      fileName,
      blob,
      {
        openBlobInWebView: false,
      },
    );
    if (result === "failed" && openServerExport("xlsx")) return;
    showSaveResult(result);
  };

  const exportPdf = async () => {
    if (periodTxs.length + periodBusinessTxs.length === 0) {
      toast(
        locale === "ru"
          ? "За выбранный период нет операций для PDF."
          : "There are no entries for PDF in the selected period.",
        "default",
      );
      return;
    }
    const pdf = buildTransactionsPdfBlob({
      transactions: periodTxs,
      categories,
      businessTransactions: periodBusinessTxs,
      businessUnits,
      locale,
      periodStart: period.from,
      periodEnd: period.to,
      title: t(locale, "moreReportsExportTitle"),
    });
    const fileName = `prosto-budget-${period.from}_${period.to}.pdf`;
    const prepared = await prepareBlobFile(fileName, pdf);
    if (prepared) {
      setPreparedFile({ type: "pdf", url: prepared.url, fileName: prepared.fileName });
      toast(
        locale === "ru"
          ? "PDF готов. Если файл не открылся сам — нажмите кнопку ниже."
          : "PDF is ready. If it did not open automatically, tap the button below.",
        "default",
      );
      const tg = window.Telegram?.WebApp;
      if (tg?.openLink) {
        try {
          tg.openLink(prepared.url, { try_instant_view: false });
          return;
        } catch {
          /* fallback below */
        }
      }
      const opened = window.open(prepared.url, "_blank", "noopener,noreferrer");
      if (!opened) return;
      return;
    }
    const result = await saveBlobFile(fileName, pdf, {
      openBlobInWebView: false,
    });
    if (result === "failed" && (await downloadPreparedBlob(fileName, pdf))) return;
    showSaveResult(result);
  };

  return (
    <div className="space-y-5 py-1">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t(locale, "moreReportsExportSection")}</h3>
        <p className="text-xs text-muted-foreground">{t(locale, "moreReportsExportHint")}</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">{t(locale, "moreReportsFrom")}</label>
            <Input
              type="date"
              value={period.from}
              onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">{t(locale, "moreReportsTo")}</label>
            <Input
              type="date"
              value={period.to}
              onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(locale, "moreReportsCount", { count: String(exportCount) })}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="default"
            className="gap-1.5 opacity-100"
            disabled={false}
            onClick={() => void exportExcel()}
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            {t(locale, "moreReportsExcel")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            disabled={false}
            onClick={() => void exportPdf()}
          >
            <FileText className="h-4 w-4" aria-hidden />
            {t(locale, "moreReportsPdf")}
          </Button>
        </div>
        {preparedFile ? (
          <div className="rounded-md border border-primary/25 bg-primary/5 p-3 text-xs leading-relaxed">
            <p className="font-medium text-foreground">
              {preparedFile.type === "pdf"
                ? locale === "ru"
                  ? "PDF готов"
                  : "PDF is ready"
                : locale === "ru"
                  ? "Файл готов"
                  : "File is ready"}
            </p>
            <p className="mt-1 text-muted-foreground">
              {locale === "ru"
                ? "Если Telegram не открыл скачивание автоматически, нажмите кнопку."
                : "If Telegram did not open the download automatically, tap the button."}
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button type="button" size="sm" onClick={openPreparedFile}>
                {locale === "ru" ? "Открыть / скачать" : "Open / download"}
              </Button>
              <Button asChild type="button" size="sm" variant="outline">
                <a
                  href={preparedFile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={preparedFile.fileName}
                >
                  {locale === "ru" ? "Ссылка на файл" : "File link"}
                </a>
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          {t(locale, "moreReportsAiSection")}
        </h3>
        {!token ? (
          <p className="text-xs text-muted-foreground">{t(locale, "moreReportsCloudRequired")}</p>
        ) : !tableReady ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
            {t(locale, "moreReportsDbMigrate")}
          </p>
        ) : null}

        <Tabs value={historyKind} onValueChange={(v) => setHistoryKind(v as "weekly" | "monthly")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="weekly">{t(locale, "aiTabWeekly")}</TabsTrigger>
            <TabsTrigger value="monthly">{t(locale, "aiTabMonthly")}</TabsTrigger>
          </TabsList>
          <TabsContent value="weekly">
            <AiReportHistory
              locale={locale}
              kind="weekly"
              reports={reports}
              loading={historyLoading}
            />
          </TabsContent>
          <TabsContent value="monthly">
            <AiReportHistory
              locale={locale}
              kind="monthly"
              reports={reports}
              loading={historyLoading}
            />
          </TabsContent>
        </Tabs>

        <Button type="button" size="sm" variant="ghost" onClick={() => void loadHistory()}>
          {t(locale, "moreReportsRefreshHistory")}
        </Button>
      </section>
    </div>
  );
}
