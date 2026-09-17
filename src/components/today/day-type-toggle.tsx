"use client";

import { useTransition } from "react";

import { cn } from "@/lib/utils";
import type { DayType } from "@/lib/meals/today-view-types";

/** DT / DNT in one tap. Persisted immediately. */
export function DayTypeToggle({
  dayType,
  onChange,
  disabled,
}: {
  dayType: DayType;
  onChange: (next: DayType) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const options: DayType[] = ["DT", "DNT"];

  return (
    <div
      role="group"
      aria-label="Typ dnia"
      className={cn("grid grid-cols-2 gap-1 rounded-full bg-muted p-1", pending && "opacity-70")}
    >
      {options.map((option) => {
        const active = option === dayType;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            disabled={disabled || pending}
            onClick={() => {
              if (active) return;
              startTransition(async () => {
                await onChange(option);
              });
            }}
            className={cn(
              "h-10 min-w-16 rounded-full px-4 text-sm font-bold transition-colors",
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
