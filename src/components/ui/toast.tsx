"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ToastItem {
  id: string;
  message: string;
  variant?: "default" | "success" | "error";
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastItem["variant"]) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const toast = useCallback((message: string, variant: ToastItem["variant"] = "default") => {
    counterRef.current += 1;
    const id = `${Date.now()}-${counterRef.current}`;
    const duration = variant === "error" ? 4000 : 2200;
    setItems((prev) => [...prev.slice(-2), { id, message, variant }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-20 left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto rounded-lg px-4 py-2 text-sm shadow-lg",
              item.variant === "success" && "bg-emerald-600 text-white",
              item.variant === "error" && "bg-red-600 text-white",
              (!item.variant || item.variant === "default") && "bg-foreground text-background",
            )}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
