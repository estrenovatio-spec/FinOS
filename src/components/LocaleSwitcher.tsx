"use client";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/types";
import { useStore } from "@/store/useStore";

export function LocaleSwitcher() {
  const locale = useStore((s) => s.locale);
  const setLocale = useStore((s) => s.setLocale);

  const toggle = () => {
    const next: Locale = locale === "ru" ? "en" : "ru";
    setLocale(next);
  };

  return (
    <Button variant="outline" size="sm" onClick={toggle} type="button" aria-label="Switch language">
      {locale.toUpperCase()}
    </Button>
  );
}
