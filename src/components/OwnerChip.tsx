"use client";

import { cn } from "@/lib/utils";
import { ownerChipStyle } from "@/lib/owner-chip-colors";

export function ownerInitial(label: string): string {
  const clean = label.trim();
  if (!clean) return "?";
  return [...clean][0]?.toUpperCase() ?? "?";
}

export function OwnerChip({
  label,
  color,
  title,
  className,
}: {
  label: string;
  color: string;
  title?: string;
  className?: string;
}) {
  const style = ownerChipStyle(color);
  return (
    <span
      title={title ?? label}
      style={style}
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none",
        className,
      )}
    >
      {ownerInitial(label)}
    </span>
  );
}
