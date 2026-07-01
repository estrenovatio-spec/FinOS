"use client";

import { CircleHelp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HelpFaqChat } from "@/components/HelpFaqChat";
import { faqCheatsheetSections } from "@/lib/help-faq-content";
import { t } from "@/lib/i18n";
import type { Locale } from "@/types";

type HelpFaqDialogProps = {
  locale: Locale;
  variant?: "settings";
};

export function HelpFaqDialog({ locale, variant = "settings" }: HelpFaqDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={variant === "settings" ? "secondary" : "outline"}
          className="w-full gap-2"
        >
          <CircleHelp className="h-4 w-4 shrink-0" />
          {t(locale, "helpButton")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(locale, "helpTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(locale, "helpCheatsheetTitle")}
            </p>
            <div className="space-y-4">
              {faqCheatsheetSections(locale).map((section) => (
                <div key={section.title}>
                  <p className="mb-1 text-sm font-medium text-foreground">{section.title}</p>
                  <ul className="space-y-1 pl-0.5 text-sm text-muted-foreground">
                    {section.steps.map((step) => (
                      <li key={step} className="flex gap-2">
                        <span className="shrink-0 text-muted-foreground/70">·</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                  {section.example ? (
                    <p className="mt-1.5 pl-0.5 text-sm">
                      <span className="text-muted-foreground">{t(locale, "helpCheatsheetExample")}: </span>
                      <span className="font-medium text-foreground">«{section.example}»</span>
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              {t(locale, "helpCheatsheetFooter")}
            </p>
          </div>
          <HelpFaqChat locale={locale} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
