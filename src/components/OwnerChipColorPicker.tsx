"use client";

import { OwnerChip } from "@/components/OwnerChip";
import {
  OWNER_CHIP_PRESETS,
  sanitizeOwnerChipColor,
} from "@/lib/owner-chip-colors";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string;
  fallback: string;
  previewLabel: string;
  onChange: (hex: string) => void;
};

export function OwnerChipColorPicker({
  label,
  value,
  fallback,
  previewLabel,
  onChange,
}: Props) {
  const current = sanitizeOwnerChipColor(value, fallback);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <OwnerChip label={previewLabel} color={current} className="h-6 w-6 text-[11px]" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {OWNER_CHIP_PRESETS.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={hex}
            aria-pressed={current === hex}
            className={cn(
              "h-8 w-8 shrink-0 rounded-full border-2 transition-transform active:scale-95",
              current === hex ? "border-foreground ring-2 ring-ring ring-offset-2" : "border-transparent",
            )}
            style={{ backgroundColor: hex }}
            onClick={() => onChange(hex)}
          />
        ))}
        <label className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-muted-foreground/50">
          <span className="text-[9px] font-medium text-muted-foreground">+</span>
          <input
            type="color"
            value={current}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
