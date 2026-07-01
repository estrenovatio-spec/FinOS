"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { useStore } from "@/store/useStore";

/** Wireframe «Капитал / Бизнес» — без бэкенда. */
export function CapitalPreviewContent({ showBadge = true }: { showBadge?: boolean }) {
  const locale = useStore((s) => s.locale);

  return (
    <div className="space-y-4">
      {showBadge ? (
        <span className="inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">
          {t(locale, "previewCapitalBadge")}
        </span>
      ) : null}

      <h2 className="text-xl font-bold">{t(locale, "previewCapitalTitle")}</h2>

      <Card className="border-2 border-primary/25">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">🎯 Финансовый пульс</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-2xl font-bold tabular-nums">487 300 ₽</p>
          <p className="text-emerald-600 dark:text-emerald-400">▲ +12 400 ₽ за месяц</p>
        </CardContent>
      </Card>

      <p className="text-sm font-medium">📦 3 контура</p>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg border-2 border-red-200 bg-red-50/80 p-2 dark:border-red-900 dark:bg-red-950/40">
          <p className="font-medium text-red-700 dark:text-red-300">Обязательные</p>
          <p className="mt-1 font-semibold tabular-nums">142к</p>
        </div>
        <div className="rounded-lg border-2 border-amber-200 bg-amber-50/80 p-2 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="font-medium text-amber-800 dark:text-amber-200">Переменные</p>
          <p className="mt-1 font-semibold tabular-nums">68к</p>
        </div>
        <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/80 p-2 dark:border-emerald-900 dark:bg-emerald-950/40">
          <p className="font-medium text-emerald-800 dark:text-emerald-200">Капитал</p>
          <p className="mt-1 font-semibold tabular-nums">277к</p>
        </div>
      </div>

      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        {t(locale, "businessModeBody")}
      </p>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">📈 Инвестиции (скоро)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t(locale, "businessModeBullet2")}
        </CardContent>
      </Card>
    </div>
  );
}
