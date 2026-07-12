"use client";

import { useState } from "react";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/store/useStore";

type QuickAddOperationDialogProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
};

export function QuickAddOperationDialog({
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
}: QuickAddOperationDialogProps = {}) {
  const locale = useStore((s) => s.locale);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  return (
    <>
      {showTrigger ? (
        <div className="sticky bottom-20 z-20 pt-2">
          <Button
            type="button"
            className="h-12 w-full rounded-xl text-base font-semibold shadow-lg"
            onClick={() => setOpen(true)}
          >
            {locale === "ru" ? "Добавить операцию" : "Add entry"}
          </Button>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md rounded-2xl p-4 sm:p-5">
          <DialogHeader className="space-y-2">
            <DialogTitle>
              {locale === "ru" ? "Добавить операцию" : "Add entry"}
            </DialogTitle>
            <p className="text-sm leading-snug text-muted-foreground">
              {locale === "ru"
                ? "Напишите обычным языком: 500 такси, 120000 зарплата, 40000 оплатил школу."
                : "Write naturally: 500 taxi, 120000 salary, 40000 paid school."}
            </p>
          </DialogHeader>
          <VoiceRecorder compact onSubmitted={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
