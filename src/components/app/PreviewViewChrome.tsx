"use client";

import { PreviewHeaderNav } from "@/components/app/PreviewHeaderNav";
import type { AppTabId } from "@/lib/app-bottom-nav";

/** Верхняя полоска для «Бизнес» / «Ещё» (навигация; настройки — во вкладке Ещё). */
export function PreviewViewChrome({
  active,
  onChange,
}: {
  active: AppTabId;
  onChange: (tab: AppTabId) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 pb-2 pt-1">
      <div className="min-w-0 flex-1" aria-hidden />
      <PreviewViewControls active={active} onChange={onChange} />
    </div>
  );
}

export function PreviewViewControls({
  active,
  onChange,
}: {
  active: AppTabId;
  onChange: (tab: AppTabId) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <PreviewHeaderNav active={active} onChange={onChange} />
    </div>
  );
}
