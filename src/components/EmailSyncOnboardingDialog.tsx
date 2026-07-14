"use client";

import { useEffect, useState } from "react";
import { HouseholdCloudPanel } from "@/components/HouseholdCloudPanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCloudStore } from "@/store/useCloudStore";

const ONBOARDING_KEY = "voicebudget-email-onboarding-v1";

export function EmailSyncOnboardingDialog() {
  const [open, setOpen] = useState(false);
  const token = useCloudStore((s) => s.token);
  const household = useCloudStore((s) => s.household);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!useCloudStore.persist?.hasHydrated?.()) return;
    if (token && household) {
      localStorage.setItem(ONBOARDING_KEY, "done");
      setOpen(false);
      return;
    }
    if (localStorage.getItem(ONBOARDING_KEY) === "done") return;
    setOpen(true);
  }, [token, household]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Сохраните данные и продолжайте на любом устройстве</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Войдите по email, чтобы FIN OS автоматически синхронизировал данные
            между телефоном и компьютером.
          </p>
          <HouseholdCloudPanel embedded />
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              localStorage.setItem(ONBOARDING_KEY, "done");
              setOpen(false);
            }}
          >
            Продолжить без входа
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
