"use client";

import {
  ChevronDown,
  ChevronUp,
  PiggyBank,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { TodayOverviewItem } from "@/components/today/today-screen-presenter";

const CURRENT_BALANCE_HINT_DISMISSED_KEY = "finos-current-balance-hint-dismissed-v1";

function iconForItem(id: TodayOverviewItem["id"]) {
  switch (id) {
    case "current-balance":
      return Wallet;
    case "planned-free-money":
      return PiggyBank;
  }
}

export function TodayOverview({
  title,
  items,
  onItemAction,
}: {
  title?: string | null;
  items: TodayOverviewItem[];
  onItemAction?: (
    actionKey: NonNullable<
      TodayOverviewItem["actionKey"] | TodayOverviewItem["secondaryActionKey"]
    >,
  ) => void;
}) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [currentBalanceHintDismissed, setCurrentBalanceHintDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(CURRENT_BALANCE_HINT_DISMISSED_KEY) === "1";
  });
  if (items.length === 0) return null;

  function dismissCurrentBalanceHint() {
    setCurrentBalanceHintDismissed(true);
    try {
      window.localStorage.setItem(CURRENT_BALANCE_HINT_DISMISSED_KEY, "1");
    } catch {
      // localStorage can be unavailable in embedded/private contexts.
    }
  }

  return (
    <section className="space-y-5">
      {title ? (
        <div className="px-1">
          <h2 className="text-sm font-semibold tracking-[0.08em] text-foreground">{title}</h2>
        </div>
      ) : null}

      <div className="space-y-4">
        {items.map((item) => {
          const Icon = iconForItem(item.id);
          if (!Icon) return null;
          const showCaption =
            Boolean(item.caption) &&
            !(item.id === "current-balance" && item.dismissibleCaption && currentBalanceHintDismissed);
          const expandable = Boolean(item.details && item.details.length > 0);
          const expanded = expandedItemId === item.id;
          const Chevron = expanded ? ChevronUp : ChevronDown;
          return (
            <section
              key={item.id}
              className={`space-y-4 rounded-[30px] border border-border/45 bg-card/90 px-5 py-5 shadow-none ${
                item.layout === "wide" ? "w-full" : ""
              }`}
            >
              <div className="space-y-2">
                <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <Icon className="h-4 w-4 shrink-0" />
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em]">
                    {item.label}
                  </p>
                </div>
                {item.subtitle ? (
                  <p className="text-xs font-medium text-muted-foreground">{item.subtitle}</p>
                ) : null}
                {expandable ? (
                  <button
                    type="button"
                    className="w-full space-y-3 text-left"
                    onClick={() =>
                      setExpandedItemId((current) => (current === item.id ? null : item.id))
                    }
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <p className="text-[2.4rem] font-semibold leading-none tracking-[-0.03em] text-foreground sm:text-[2.8rem]">
                          {item.value}
                        </p>
                        {item.valueNote ? (
                          <p className="text-sm text-muted-foreground">{item.valueNote}</p>
                        ) : null}
                      </div>
                      <Chevron className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    {showCaption ? (
                      <div className="flex items-start justify-between gap-2">
                        <p className="max-w-[36rem] text-sm leading-6 text-muted-foreground">{item.caption}</p>
                        {item.id === "current-balance" && item.dismissibleCaption ? (
                          <button
                            type="button"
                            aria-label="Скрыть пояснение"
                            className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            onClick={(event) => {
                              event.stopPropagation();
                              dismissCurrentBalanceHint();
                            }}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {expanded && item.details ? (
                      <div className="space-y-2 rounded-2xl border border-border/50 bg-muted/25 p-4">
                        {item.details.map((detail, index) => {
                          const toneClassName =
                            detail.tone === "positive"
                              ? "text-emerald-700 dark:text-emerald-300"
                              : detail.tone === "negative"
                                ? "text-foreground"
                                : detail.tone === "total"
                                  ? "font-semibold text-foreground"
                                  : "text-foreground";
                          return (
                            <div key={`${item.id}-detail-${index}`}>
                              {detail.tone === "total" ? (
                                <div className="border-t border-border/70 pt-3" />
                              ) : null}
                              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 text-sm">
                                <p className="break-words text-muted-foreground">{detail.label}</p>
                                <p className={`shrink-0 whitespace-nowrap text-right ${toneClassName}`}>
                                  {detail.value}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </button>
                ) : (
                  <>
                    <div className="space-y-2">
                      <p className="text-[2.1rem] font-semibold leading-none tracking-[-0.03em] text-foreground">
                        {item.value}
                      </p>
                      {item.valueNote ? (
                        <p className="text-sm text-muted-foreground">{item.valueNote}</p>
                      ) : null}
                    </div>
                    {showCaption ? (
                      <div className="flex items-start justify-between gap-2">
                        <p className="max-w-[36rem] text-sm leading-6 text-muted-foreground">
                          {item.caption}
                        </p>
                        {item.id === "current-balance" && item.dismissibleCaption ? (
                          <button
                            type="button"
                            aria-label="Скрыть пояснение"
                            className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            onClick={dismissCurrentBalanceHint}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
                {item.actionLabel && item.actionKey ? (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant={item.actionVariant === "primary" || item.actionVariant === "highlight" ? "default" : "ghost"}
                      size={item.actionVariant === "primary" || item.actionVariant === "highlight" ? "default" : "sm"}
                      className={
                        item.actionVariant === "primary"
                          ? "mt-1 h-12 w-full rounded-2xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 sm:w-auto sm:px-6"
                          : item.actionVariant === "highlight"
                            ? "mt-1 h-12 w-full rounded-2xl border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100 sm:w-auto sm:px-6"
                          : "h-auto justify-start self-start px-0 py-0 text-sm font-medium text-muted-foreground hover:text-foreground"
                      }
                      aria-label={`${item.actionLabel}: ${item.label}`}
                      onClick={() => onItemAction?.(item.actionKey!)}
                    >
                      {item.actionLabel}
                    </Button>
                    {item.secondaryActionLabel && item.secondaryActionKey ? (
                      <Button
                        type="button"
                        variant={item.secondaryActionVariant === "outline" ? "outline" : "ghost"}
                        size="sm"
                        className="h-auto w-full justify-start px-0 py-1 text-sm font-medium text-muted-foreground hover:text-foreground sm:w-auto"
                        aria-label={`${item.secondaryActionLabel}: ${item.label}`}
                        onClick={() => onItemAction?.(item.secondaryActionKey!)}
                      >
                        {item.secondaryActionLabel}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
