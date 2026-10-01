"use client";

import { useState, useTransition } from "react";
import { Check, Minus, Plus, Repeat, Trash2, Undo2 } from "lucide-react";

import { MealImage } from "@/components/meals/meal-image";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { isEaten, portionLabel, type Macros, type TodayMeal } from "@/lib/meals/today-view-types";

const STEP = 0.25;
const MIN_PORTIONS = 0.25;
const MAX_PORTIONS = 4;

type Fields = Record<keyof Macros, string>;

const FIELDS: [keyof Macros, string][] = [
  ["kcal", "kcal"],
  ["protein_g", "B"],
  ["fat_g", "T"],
  ["carbs_g", "W"],
];

function show(value: number): string {
  return String(Math.round(value * 10) / 10).replace(".", ",");
}

function toFields(macros: Macros): Fields {
  return {
    kcal: String(Math.round(macros.kcal)),
    protein_g: show(macros.protein_g),
    fat_g: show(macros.fat_g),
    carbs_g: show(macros.carbs_g),
  };
}

/** "12,5" or "12.5" -> 12.5; anything unreadable -> null. */
function read(value: string): number | null {
  const number = Number(value.replace(",", ".").trim());
  return value.trim() !== "" && Number.isFinite(number) && number >= 0 ? number : null;
}

/**
 * Everything about one entry on today's list, in one place: portion, the
 * numbers themselves, eaten or not, swap, remove. Changes apply to today only;
 * the recipe in the sheet stays as it is.
 *
 * The parent mounts it only while a meal is selected, keyed by the meal's id,
 * so the fields start fresh for each meal.
 */
export function MealSheet({
  meal,
  onClose,
  onSave,
  onToggleEaten,
  onSwap,
  onRemove,
}: {
  meal: TodayMeal;
  onClose: () => void;
  onSave: (patch: Macros & { portions: number }) => Promise<void>;
  onToggleEaten: () => void;
  onSwap: () => void;
  onRemove: () => Promise<void>;
}) {
  const [portions, setPortions] = useState(meal.portions);
  const [fields, setFields] = useState<Fields>(() => toFields(meal));
  const [pending, startTransition] = useTransition();

  const eaten = isEaten(meal);
  const values = FIELDS.map(([key]) => read(fields[key]));
  const valid = values.every((value) => value !== null);

  /** Changing the portion rescales whatever numbers are in the fields now. */
  function stepPortions(direction: 1 | -1) {
    const next = Math.min(Math.max(portions + direction * STEP, MIN_PORTIONS), MAX_PORTIONS);
    if (next === portions) return;
    const ratio = next / portions;
    setFields((current) => {
      const scaled = { ...current };
      for (const [key] of FIELDS) {
        const value = read(current[key]);
        if (value !== null) scaled[key] = key === "kcal" ? String(Math.round(value * ratio)) : show(value * ratio);
      }
      return scaled;
    });
    setPortions(next);
  }

  function save() {
    if (!valid) return;
    const [kcal, protein_g, fat_g, carbs_g] = values as number[];
    startTransition(async () => {
      await onSave({ portions, kcal, protein_g, fat_g, carbs_g });
      onClose();
    });
  }

  return (
    <Sheet open onClose={onClose} title={meal.mealName}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <MealImage name={meal.mealName} category={meal.slot} className="size-16 rounded-2xl" />
          <p className="text-sm text-muted-foreground">
            {meal.slot}
            {meal.variant ? ` · ${meal.variant}` : ""}
            {meal.prepared && !eaten ? " · z lodówki" : ""}
            <br />
            {eaten ? "Zjedzone" : "Zaplanowane"}
          </p>
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Porcja</h3>
          <div className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center rounded-2xl border bg-card">
            <button
              type="button"
              aria-label="Mniejsza porcja"
              onClick={() => stepPortions(-1)}
              className="flex h-14 items-center justify-center text-primary disabled:opacity-30"
              disabled={portions <= MIN_PORTIONS}
            >
              <Minus className="size-6" strokeWidth={3} />
            </button>
            <p className="text-center text-xl font-extrabold tabular-nums">{portionLabel(portions)}</p>
            <button
              type="button"
              aria-label="Większa porcja"
              onClick={() => stepPortions(1)}
              className="flex h-14 items-center justify-center text-primary disabled:opacity-30"
              disabled={portions >= MAX_PORTIONS}
            >
              <Plus className="size-6" strokeWidth={3} />
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Kalorie i makro</h3>
          <div className="grid grid-cols-4 gap-2">
            {FIELDS.map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 rounded-xl border bg-card px-2.5 py-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
                <span className="text-[0.65rem] font-bold tracking-wider text-muted-foreground uppercase">{label}</span>
                <input
                  inputMode="decimal"
                  value={fields[key]}
                  onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))}
                  aria-invalid={read(fields[key]) === null}
                  className={cn(
                    "w-full min-w-0 bg-transparent text-lg font-bold tabular-nums outline-none",
                    read(fields[key]) === null && "text-destructive",
                  )}
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Liczby przeliczają się z porcją. Możesz też wpisać własne.</p>
        </section>

        <Button size="lg" onClick={save} disabled={!valid || pending}>
          Zapisz
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => {
              onToggleEaten();
              onClose();
            }}
          >
            {eaten ? <Undo2 /> : <Check />}
            {eaten ? "Nie zjedzone" : "Zjedzone"}
          </Button>
          {eaten ? (
            <Button variant="outline" disabled>
              <Repeat />
              Zamień
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                onClose();
                onSwap();
              }}
            >
              <Repeat />
              Zamień
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          className="text-destructive"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await onRemove();
              onClose();
            })
          }
        >
          <Trash2 />
          Usuń z dnia
        </Button>
      </div>
    </Sheet>
  );
}
