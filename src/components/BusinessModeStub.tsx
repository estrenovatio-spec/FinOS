"use client";

import Link from "next/link";
import { Briefcase } from "lucide-react";
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
import { t } from "@/lib/i18n";
import { useStore } from "@/store/useStore";

/** Заглушка вкладки «Бизнес» — пока без отдельного контура данных */
export function BusinessModeStub() {
  const locale = useStore((s) => s.locale);
  const [open, setOpen] = useState(false);

  const handleTelegramBack = useCallback(() => {
    if (!open) return false;
    setOpen(false);
    return true;
  }, [open]);

  useTelegramBackHandler(handleTelegramBack, open);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          type="button"
          className="min-w-[2.5rem] gap-1 px-2 font-semibold"
          aria-label={t(locale, "businessModeAria")}
        >
          <Briefcase className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          {t(locale, "businessModeButton")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t(locale, "businessModeTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-muted-foreground">{t(locale, "businessModeBody")}</p>
        <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
          <li>{t(locale, "businessModeBullet1")}</li>
          <li>{t(locale, "businessModeBullet2")}</li>
          <li>{t(locale, "businessModeBullet3")}</li>
        </ul>
        <div className="flex flex-col gap-2 pt-1">
          <Button type="button" variant="outline" className="w-full" asChild>
            <Link href="/preview/capital" onClick={() => setOpen(false)}>
              {t(locale, "businessModePreview")}
            </Link>
          </Button>
          <Button type="button" className="w-full" onClick={() => setOpen(false)}>
            {t(locale, "businessModeOk")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
