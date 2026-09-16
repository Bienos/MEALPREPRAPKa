"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { Meal } from "@/lib/meals/types";
import { MealCard } from "./meal-card";

export function MealBrowser({ meals, categories }: { meals: Meal[]; categories: string[] }) {
  const [category, setCategory] = useState<string | null>(null);
  const visible = category ? meals.filter((meal) => meal.category === category) : meals;
  const chips: { label: string; value: string | null }[] = [
    { label: "Wszystkie", value: null },
    ...categories.map((value) => ({ label: value, value })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <div role="group" aria-label="Kategorie" className="flex w-max gap-2">
          {chips.map((chip) => {
            const active = chip.value === category;
            return (
              <button
                key={chip.label}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(chip.value)}
                className={cn(
                  "h-10 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {visible.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {visible.map((meal) => (
            <li key={meal.key}>
              <MealCard meal={meal} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-muted-foreground">Brak posiłków w tej kategorii.</p>
      )}
    </div>
  );
}
