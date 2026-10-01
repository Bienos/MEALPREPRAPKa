"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { matchesSlot } from "@/lib/meals/prep-plan";
import type { Meal } from "@/lib/meals/types";
import { MealCard } from "./meal-card";

/** Lowercase, no Polish diacritics, for search and category matching. */
function fold(value: string): string {
  return value.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/\p{M}/gu, "").trim();
}

type Filter = { label: string; test: (meal: Meal, ready: number) => boolean };

/**
 * A handful of filters by when you eat, instead of every sheet category. Each
 * matches the start of the sheet's category, so "Meal prep — AIR FRYER" is
 * still lunch.
 */
const FILTERS: Filter[] = [
  { label: "Wszystkie", test: () => true },
  { label: "W lodówce", test: (_meal, ready) => ready > 0 },
  { label: "Śniadanie", test: (meal) => matchesSlot(meal.category, "sniadanie") },
  { label: "Obiad", test: (meal) => matchesSlot(meal.category, "obiad") },
  { label: "Kolacja", test: (meal) => matchesSlot(meal.category, "kolacja") },
  { label: "Przekąski", test: (meal) => /^(przekask|lekki)/.test(fold(meal.category)) },
  { label: "Awaryjne", test: (meal) => fold(meal.category).startsWith("awaryjne") },
];

export function MealBrowser({ meals, ready }: { meals: Meal[]; ready: Record<string, number> }) {
  const [filter, setFilter] = useState(FILTERS[0]);
  const [query, setQuery] = useState("");
  const needle = fold(query);

  const visible = meals.filter(
    (meal) =>
      filter.test(meal, ready[meal.key] ?? 0) &&
      (!needle || fold(meal.name).includes(needle) || meal.variants.some((v) => fold(v.ingredients).includes(needle))),
  );
  // "W lodówce" only appears when something is actually there.
  const filters = FILTERS.filter((candidate) => candidate.label !== "W lodówce" || Object.keys(ready).length > 0);

  return (
    <div className="flex flex-col gap-4">
      <label className="flex h-12 items-center gap-2 rounded-2xl border bg-card px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
        <Search className="size-5 shrink-0 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Szukaj: kurczak, makaron, skyr…"
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          enterKeyHint="search"
        />
      </label>

      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <div role="group" aria-label="Filtr" className="flex w-max gap-2">
          {filters.map((candidate) => {
            const active = candidate.label === filter.label;
            return (
              <button
                key={candidate.label}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(candidate)}
                className={cn(
                  "h-10 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                )}
              >
                {candidate.label}
              </button>
            );
          })}
        </div>
      </div>

      {visible.length > 0 ? (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5">
          {visible.map((meal) => (
            <li key={meal.key} className="min-w-0">
              <MealCard meal={meal} ready={ready[meal.key] ?? 0} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-muted-foreground">Nic nie pasuje. Spróbuj innego słowa albo filtra.</p>
      )}
    </div>
  );
}
