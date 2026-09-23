"use client";

import { useEffect, useState } from "react";

/** Shows the FinOS opening screen for a consistent two-second launch transition. */
export function AppSplashScreen() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 2_000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background px-6"
      role="status"
      aria-label="FinOS загружается"
    >
      <div className="-mt-10 text-center">
        <p className="font-serif text-5xl font-normal tracking-[-0.05em] text-foreground">
          FinOS
        </p>
        <p className="mt-3 text-base text-muted-foreground">
          Личная финансовая система
        </p>
      </div>
    </div>
  );
}
