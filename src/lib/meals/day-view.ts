import "server-only";

import { addDays } from "@/lib/date";
import { listDayPlans, listPlannedMeals, listPlannedMealsBetween } from "@/lib/db/day-plans";
import { listAllDefaultDayMeals } from "@/lib/db/default-day";
import type { IsoDate } from "@/lib/db/helpers";
import { listAvailablePortions, listPrepBatchesBetween } from "@/lib/db/prep";
import { getSettings, getTargets } from "@/lib/db/settings";
import { buildDays, type DayCell } from "./calendar";
import { getMealLibrary } from "./library";
import { resolveDayType } from "./plan";
import {
  sortDay,
  toTodayMeal,
  type AddOption,
  type DayType,
  type Macros,
  type TodayMeal,
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

/** How many days the strip shows on each side of the day in view. */
const STRIP_REACH = 3;

/** The strip of days at the top of a day's screen: the day in view in the middle. */
export async function loadDayStrip(center: IsoDate, today: IsoDate): Promise<DayCell[]> {
  const from = addDays(center, -STRIP_REACH);
  const to = addDays(center, STRIP_REACH);
  const [settings, targets, plans, entries] = await Promise.all([
    getSettings(),
    getTargets(),
    listDayPlans(from, to),
    listPlannedMealsBetween(from, to),
  ]);
  return buildDays({
    from,
    to,
    today,
    entries,
    dayTypes: Object.fromEntries(plans.map((plan) => [plan.date, plan.day_type])) as Record<string, DayType>,
    cookedOn: new Set(),
    targets,
    defaultDayType: settings.default_day_type,
  });
}
