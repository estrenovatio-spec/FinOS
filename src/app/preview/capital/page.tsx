"use client";

import Link from "next/link";
import { CapitalPreviewContent } from "@/components/CapitalPreviewContent";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { useStore } from "@/store/useStore";

/** Статичный wireframe «Капитал» — без бэкенда, для согласования UX */
export default function CapitalPreviewPage() {
  const locale = useStore((s) => s.locale);

  return (
    <main className="mx-auto min-h-[var(--tg-viewport-height,100vh)] max-w-lg bg-background px-4 pb-10 pt-3">
      <div className="mb-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">{t(locale, "previewCapitalBack")}</Link>
        </Button>
      </div>
      <CapitalPreviewContent />
    </main>
  );
}
