"use client";

import { useTransition } from "react";
import { Snowflake } from "lucide-react";

import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Candidate } from "@/lib/meals/recommend";

function delta(value: number, unit: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} ${unit}`;
}

/** [ ZAMIEŃ ]: three best alternatives, chosen in one more tap. */
export function SwapSheet({
  open,
  onClose,
  mealName,
  options,
  onUse,
}: {
  open: boolean;
  onClose: () => void;
  mealName: string;
  /** null while the alternatives are still being fetched. */
  options: Candidate[] | null;
  onUse: (candidate: Candidate) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();


  return (
    <Sheet open={open} onClose={onClose} title="Najlepsze zamiany">
      <p className="mb-3 text-sm text-muted-foreground">Zamiast: {mealName}</p>

      {options === null ? (
        <p className="py-6 text-center text-muted-foreground">Szukam…</p>
      ) : options.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground">Brak alternatyw w bibliotece.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {options.map((option) => (
            <li key={`${option.mealKey}-${option.variant}`}>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => { await onUse(option); onClose(); })}
                className="flex w-full min-h-20 items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left hover:bg-muted disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-bold">{option.mealName}</span>
                    {option.ready ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">
                        <Snowflake className="size-3" />
                        {option.readyLocation === "freezer" ? "ZAMRAŻARKA" : "LODÓWKA"}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 flex gap-3 text-sm text-muted-foreground">
                    <span className={cn(option.deltaKcal > 0 ? "text-foreground" : "")}>
                      {delta(option.deltaKcal, "kcal")}
                    </span>
                    <span>{delta(option.deltaProtein, "B")}</span>
                    {option.variant ? <span>{option.variant}</span> : null}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
                  Użyj
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

