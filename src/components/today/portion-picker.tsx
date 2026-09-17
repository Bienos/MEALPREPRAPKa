"use client";

import { useState } from "react";
import { Scale } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PORTION_OPTIONS, portionLabel } from "@/lib/meals/today-view-types";

/** Compact portion override: a button that expands into the four options. */
export function PortionPicker({
  portions,
  onChange,
}: {
  portions: number;
  onChange: (next: number) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(true)}>
        <Scale />
        Porcja {portionLabel(portions)}
      </Button>
    );
  }

  return (
    <div role="group" aria-label="Wielkość porcji" className="flex flex-1 gap-1 rounded-full bg-muted p-1">
      {PORTION_OPTIONS.map((option) => {
        const active = Math.abs(option - portions) < 0.001;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => {
              onChange(option);
              setOpen(false);
            }}
            className={cn(
              "h-10 flex-1 rounded-full text-sm font-bold transition-colors",
              active ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {portionLabel(option)}
          </button>
        );
      })}
    </div>
  );
}
