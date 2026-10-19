"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import { MealImage } from "@/components/meals/meal-image";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { DayType } from "@/lib/meals/today-view-types";
import type { WeekOption } from "@/lib/meals/week-plan";
import { Stepper } from "./stepper";

/** Lowercase, no Polish diacritics: "Tuńczyk" and "tunczyk" match each other. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/\p{M}/gu, "").trim();
}

/**
 * Picking for one meal of the day. It stays open so several dishes can be
 * added in a row, with the week's total right at the top as they go in.
 */
export function WeekAddSheet({
  open,
  onClose,
  title,
  options,
  counts,
  removable,
  dayType,
  total,
  target,
  onAdd,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  options: WeekOption[];
  /** Portions of each dish already in the week. */
  counts: Record<string, number>;
  removable: (mealKey: string) => boolean;
  /** Which version's calories to show: the type most of the week has. */
  dayType: DayType;
  total: number;
  target: number;
  onAdd: (option: WeekOption) => void;
  onRemove: (mealKey: string) => void;
}) {
  const [query, setQuery] = useState("");

  const needle = normalize(query);
  const matching = needle
    ? options.filter((option) => normalize(option.name).includes(needle) || normalize(option.ingredients).includes(needle))
    : options;
  // What is already in the week comes first, so adjusting it is one tap away.
  const shown = [...matching].sort(
    (a, b) => Number((counts[b.mealKey] ?? 0) > 0) - Number((counts[a.mealKey] ?? 0) > 0),
  );

  const left = Math.round(target - total);

  function close() {
    setQuery("");
    onClose();
  }

  return (
    <Sheet open={open} onClose={close} title={title}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground tabular-nums">
          Tydzień: <span className="font-bold text-foreground">{Math.round(total).toLocaleString("pl-PL")}</span> /{" "}
          {Math.round(target).toLocaleString("pl-PL")} kcal
          <span className={cn("ml-1.5 font-semibold", left < 0 ? "text-destructive" : "text-primary")}>
            {left >= 0 ? `zostało ${left.toLocaleString("pl-PL")}` : `${(-left).toLocaleString("pl-PL")} ponad`}
          </span>
        </p>

        <label className="flex h-12 items-center gap-2 rounded-2xl border-2 border-primary/60 bg-card px-3 focus-within:border-primary">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Szukaj, np. kurczak"
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            enterKeyHint="search"
          />
        </label>

        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nic takiego w arkuszu. Spróbuj innego słowa.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shown.map((option) => {
              const count = counts[option.mealKey] ?? 0;
              const version = option.forDay[dayType];
              return (
                <li
                  key={option.mealKey}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border bg-card p-2 pr-2",
                    count > 0 && "border-primary/50 bg-primary/5",
                  )}
                >
                  <MealImage name={option.name} category={option.category} className="size-12 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{option.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {Math.round(version.kcal)} kcal · {Math.round(version.protein_g)} g białka
                    </p>
                  </div>
                  <Stepper
                    count={count}
                    canAdd
                    canRemove={count > 0 && removable(option.mealKey)}
                    onAdd={() => onAdd(option)}
                    onRemove={() => onRemove(option.mealKey)}
                    label={option.name}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
