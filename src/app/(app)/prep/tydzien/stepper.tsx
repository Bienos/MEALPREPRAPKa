"use client";

import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

/** − count + for one dish's portions this week. */
export function Stepper({
  count,
  canAdd,
  canRemove,
  onAdd,
  onRemove,
  label,
}: {
  count: number;
  canAdd: boolean;
  canRemove: boolean;
  onAdd: () => void;
  onRemove: () => void;
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {/* Nothing picked yet: only "+", with the space kept so the buttons line up. */}
      <button
        type="button"
        disabled={!canRemove}
        onClick={onRemove}
        aria-label={`Mniej: ${label}`}
        className={cn(
          "flex size-10 items-center justify-center rounded-full border bg-card disabled:opacity-30",
          count === 0 && "invisible",
        )}
      >
        <Minus className="size-4" strokeWidth={3} />
      </button>
      <span className={cn("w-7 text-center text-lg font-extrabold tabular-nums", count === 0 && "invisible")}>
        {count}
      </span>
      <button
        type="button"
        disabled={!canAdd}
        onClick={onAdd}
        aria-label={`Więcej: ${label}`}
        className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-30"
      >
        <Plus className="size-4" strokeWidth={3} />
      </button>
    </div>
  );
}
