/**
 * What changes when a day is switched between DT and DNT. Pure, so it is
 * tested without a database.
 *
 * Meals still to eat follow the day: a planned DT dish becomes its DNT
 * version, with the same portion size. Anything already eaten, logged by
 * hand, or typed in is history and stays exactly as it was.
 */

import type { Variant } from "./types.ts";

type DayType = "DT" | "DNT";

export type SwitchableMeal = {
  id: string;
  status: string;
  /** "sheet" for meals planned from the library; hand-typed ones are left alone. */
  source: string;
  mealKey: string | null;
  variant: DayType | null;
  portions: number;
};

export type DishVariant = {
  variant: Variant;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
};

export type VariantSwitch = {
  id: string;
  variant: DayType;
  /** Per single portion; the caller scales by the meal's portions. */
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
};

export function planVariantSwitch(
  meals: SwitchableMeal[],
  dayType: DayType,
  variantsOf: (mealKey: string) => DishVariant[],
): VariantSwitch[] {
  const switches: VariantSwitch[] = [];
  for (const meal of meals) {
    if (meal.status !== "planned" || meal.source !== "sheet" || !meal.mealKey) continue;
    if (meal.variant === dayType) continue;
    const target = variantsOf(meal.mealKey).find((candidate) => candidate.variant === dayType);
    if (!target) continue; // The dish has no version for this day type; keep it as it is.
    switches.push({
      id: meal.id,
      variant: dayType,
      kcal: target.kcal,
      protein_g: target.protein_g,
      fat_g: target.fat_g,
      carbs_g: target.carbs_g,
    });
  }
  return switches;
}
