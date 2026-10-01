"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MealInput } from "@/lib/meals/sheet-edit";
import { variantLabel, type Variant } from "@/lib/meals/types";
import { saveMealAction } from "@/app/(app)/meals/actions";
import { MealImage } from "./meal-image";

type Text = Record<"kcal" | "protein_g" | "fat_g" | "carbs_g", string>;

function show(value: number): string {
  return String(Math.round(value * 10) / 10).replace(".", ",");
}

function read(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value.replace(",", ".").trim());
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">{label}</span>
      {children}
    </label>
  );
}

function Segmented<T extends string | boolean | null>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">{label}</span>
      <div role="group" aria-label={label} className="grid gap-1 rounded-full bg-muted p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-10 rounded-full text-sm font-bold",
              option.value === value ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Add or edit a meal. Saving writes the sheet itself (only the cells that
 * changed), so the sheet stays the one place meals live.
 *
 * For an edit, `target` names the variant being changed; name and category
 * apply to every variant of the dish, the rest only to this one.
 */
export function MealForm({
  initial,
  target,
  categories,
  canEdit,
}: {
  initial: MealInput;
  target: { mealKey: string; variant: Variant } | null;
  categories: string[];
  canEdit: boolean;
}) {
  const [meal, setMeal] = useState(initial);
  const [numbers, setNumbers] = useState<Text>({
    kcal: initial.kcal ? String(Math.round(initial.kcal)) : "",
    protein_g: initial.kcal ? show(initial.protein_g) : "",
    fat_g: initial.kcal ? show(initial.fat_g) : "",
    carbs_g: initial.kcal ? show(initial.carbs_g) : "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof MealInput>(key: K, value: MealInput[K]) => setMeal((current) => ({ ...current, [key]: value }));
  const parsed = { kcal: read(numbers.kcal), protein_g: read(numbers.protein_g), fat_g: read(numbers.fat_g), carbs_g: read(numbers.carbs_g) };
  const numbersValid = Object.values(parsed).every((value) => Number.isFinite(value) && value >= 0);
  const valid = meal.name.trim() !== "" && meal.category.trim() !== "" && numbersValid;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || !canEdit) return;
    setError(null);
    startTransition(async () => {
      const result = await saveMealAction(target, { ...meal, ...parsed });
      // Success redirects to the meal; only a failure comes back here.
      if (result && !result.ok) setError(result.message);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {!canEdit ? (
        <p className="rounded-2xl bg-primary/10 px-4 py-3 text-sm">
          Zapisywanie w arkuszu nie jest jeszcze włączone. Potrzebne jest konto serwisowe Google z dostępem Edytora
          do arkusza; kroki są w pliku DEPLOY.md.
        </p>
      ) : null}

      <div className="flex items-center gap-4">
        <MealImage name={meal.name || "?"} category={meal.category} className="size-20 rounded-2xl" />
        <p className="text-sm text-muted-foreground">Obrazek dobiera się sam po nazwie posiłku.</p>
      </div>

      <Field label="Nazwa">
        <Input value={meal.name} onChange={(event) => set("name", event.target.value)} placeholder="np. Chicken Rice" required />
      </Field>

      <Field label="Kategoria">
        <Input
          value={meal.category}
          onChange={(event) => set("category", event.target.value)}
          list="meal-categories"
          placeholder="Śniadanie, Meal prep, Kolacja…"
          required
        />
        <datalist id="meal-categories">
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </Field>

      {target ? null : (
        <Segmented<Variant>
          label="Wersja"
          value={meal.variant}
          onChange={(value) => set("variant", value)}
          options={[
            { value: "DT", label: "DT" },
            { value: "DNT", label: "DNT" },
            { value: null, label: variantLabel(null) },
          ]}
        />
      )}

      <div className="grid grid-cols-4 gap-2">
        {(
          [
            ["kcal", "kcal"],
            ["protein_g", "B (g)"],
            ["fat_g", "T (g)"],
            ["carbs_g", "W (g)"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <Input
              inputMode="decimal"
              value={numbers[key]}
              onChange={(event) => setNumbers((current) => ({ ...current, [key]: event.target.value }))}
              aria-invalid={numbers[key] !== "" && !(read(numbers[key]) >= 0)}
              className="px-2 text-center text-lg font-bold tabular-nums"
              required
            />
          </Field>
        ))}
      </div>

      <Field label="Składniki i gramatura">
        <textarea
          value={meal.ingredients}
          onChange={(event) => set("ingredients", event.target.value)}
          rows={4}
          placeholder="Kurczak 200 g SUROWY; ryż 110 g SUCHY; warzywa 200 g"
          className="w-full rounded-lg border border-input bg-card px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </Field>

      <div className="grid grid-cols-3 gap-2">
        <Field label="Czas">
          <Input value={meal.prepTime} onChange={(event) => set("prepTime", event.target.value)} placeholder="25 min" />
        </Field>
        <Field label="Batch">
          <Input value={meal.batch} onChange={(event) => set("batch", event.target.value)} placeholder="4–6" />
        </Field>
        <Field label="Lodówka">
          <Input value={meal.fridgeLife} onChange={(event) => set("fridgeLife", event.target.value)} placeholder="3 dni" />
        </Field>
      </div>

      <Segmented<boolean | null>
        label="Mrożenie"
        value={meal.freezable}
        onChange={(value) => set("freezable", value)}
        options={[
          { value: true, label: "Tak" },
          { value: false, label: "Nie" },
          { value: null, label: "—" },
        ]}
      />

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" disabled={!valid || !canEdit || pending}>
          <FileSpreadsheet />
          {pending ? "Zapisuję w arkuszu…" : "Zapisz w arkuszu"}
        </Button>
        <Button asChild variant="ghost">
          <Link href={target ? `/meals/${target.mealKey}` : "/meals"}>Anuluj</Link>
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {target
            ? "Zmienią się tylko pola tego posiłku. Nazwa i kategoria dotyczą obu wersji DT/DNT. Przeszłe dni zostają bez zmian."
            : "Posiłek trafi na koniec arkusza jako nowy wiersz."}
        </p>
      </div>
    </form>
  );
}
