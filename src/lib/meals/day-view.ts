import "server-only";

import { addDays, longDateLabel } from "@/lib/date";
import { listPlannedMeals } from "@/lib/db/day-plans";
import { listAllDefaultDayMeals } from "@/lib/db/default-day";
import type { IsoDate } from "@/lib/db/helpers";
import { listAvailablePortions, listPrepBatchesBetween } from "@/lib/db/prep";
import { getTargets } from "@/lib/db/settings";
import { getMealLibrary } from "./library";
import { resolveDayType } from "./plan";
import {
  sortDay,
  toTodayMeal,
  type AddOption,
  type DayType,
  type Macros,
  type TodayMeal,
  type TomorrowPreview,
} from "./today-view-types";
import { variantsForDayType } from "./types";

export type DayView = {
  dayType: DayType;
  target: Macros;
  meals: TodayMeal[];
  /** Everything "Dodaj" can add in one tap: this day's version of each dish. */
  addOptions: AddOption[];
  hasTemplate: boolean;
  /** What was cooked that day, e.g. "Chicken Rice DT × 4". */
  cooked: string[];
};

/**
 * Everything one day's screen needs, in a single round of reads. Today and
 * every day opened from the calendar are the same screen, so they share this.
 */
export async function loadDayView(date: IsoDate): Promise<DayView> {
  const [targets, { dayType }, planned, templates, portions, { library }, batches] = await Promise.all([
    getTargets(),
    resolveDayType(date),
    listPlannedMeals(date),
    listAllDefaultDayMeals(),
    listAvailablePortions(),
    getMealLibrary(),
    listPrepBatchesBetween(date, date),
  ]);

  // Prepared portions per dish; a meal counts as prepared when one matches it.
  const readyCount = new Map<string, number>();
  for (const portion of portions) {
    const key = portion.batch.meal_key;
    if (key) readyCount.set(key, (readyCount.get(key) ?? 0) + 1);
  }

  return {
    dayType,
    target: targets[dayType],
    meals: sortDay(planned.map((meal) => toTodayMeal(meal, meal.meal_key !== null && readyCount.has(meal.meal_key)))),
    addOptions: variantsForDayType(library.meals, dayType).map((variant) => ({
      mealKey: variant.mealKey,
      name: variant.name,
      category: variant.category,
      variant: variant.variant,
      ingredients: variant.ingredients,
      kcal: variant.kcal,
      protein_g: variant.protein_g,
      fat_g: variant.fat_g,
      carbs_g: variant.carbs_g,
      ready: readyCount.get(variant.mealKey) ?? 0,
    })),
    hasTemplate: templates[dayType].length > 0,
    cooked: batches.map((batch) => `${batch.meal_name}${batch.variant ? ` ${batch.variant}` : ""} × ${batch.portions_made}`),
  };
}

/** The one-line look at tomorrow shown on Today. */
export async function loadTomorrowPreview(today: IsoDate): Promise<TomorrowPreview> {
  const date = addDays(today, 1);
  const [{ dayType }, planned] = await Promise.all([resolveDayType(date), listPlannedMeals(date)]);
  return {
    date,
    label: longDateLabel(date),
    dayType,
    count: planned.length,
    kcal: Math.round(planned.reduce((sum, meal) => sum + meal.kcal, 0)),
    names: planned.map((meal) => meal.meal_name),
  };
}
