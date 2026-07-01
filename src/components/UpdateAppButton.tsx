"use client";

import { Button } from "@/components/ui/button";
import { checkForAppUpdate, storeBuildTag } from "@/lib/app-update";
import { t } from "@/lib/i18n";
import { softReloadApp } from "@/lib/storage-reset";
import { useStore } from "@/store/useStore";

export function UpdateAppButton({ className = "w-full" }: { className?: string }) {
  const locale = useStore((s) => s.locale);

  const handleUpdate = async () => {
    const { serverTag } = await checkForAppUpdate();
    if (serverTag) storeBuildTag(serverTag);
    softReloadApp();
  };

  return (
    <Button
      type="button"
      variant="default"
      className={[
        className,
        "border-primary/30 bg-primary text-primary-foreground shadow-sm",
        "hover:bg-primary/90 active:bg-primary/80",
      ].join(" ")}
      onClick={() => void handleUpdate()}
    >
      {t(locale, "updateApp")}
    </Button>
  );
}
