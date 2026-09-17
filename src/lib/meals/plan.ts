import "server-only";

import {
  addPlannedMeals,
  getDayPlan,
  listPlannedMeals,
  upsertDayPlan,
  type NewPlannedMeal,
  type PlannedMeal,
} from "@/lib/db/day-plans";
import { listDefaultDayMeals } from "@/lib/db/default-day";
import { getSettings } from "@/lib/db/settings";
import type { DayType, IsoDate } from "@/lib/db/helpers";
import { getMealLibrary } from "./library";
import { findMealVariant } from "./types";

/**
 * The day type for a date: the one saved on the plan, otherwise the configured
 * default from settings. There is no weekly training schedule yet, so the
 * single default in settings is the fallback.
 */
export async function resolveDayType(date: IsoDate): Promise<{ dayType: DayType; saved: boolean }> {
  const [plan, settings] = await Promise.all([getDayPlan(date), getSettings()]);
  return plan ? { dayType: plan.day_type, saved: true } : { dayType: settings.default_day_type, saved: false };
}

export type ApplyDefaultDayResult =
  | { ok: true; created: number }
  | { ok: false; reason: "no-template" | "already-planned" | "no-meals-resolved" };

/**
 * Fills a day from its default template in one step: saves the day type, then
 * inserts one planned meal per template entry with a macro snapshot taken from
 * the current sheet. Idempotent — a day that already has meals is left alone.
 */
export async function applyDefaultDay(date: IsoDate, dayType: DayType): Promise<ApplyDefaultDayResult> {
  const [template, existing] = await Promise.all([listDefaultDayMeals(dayType), listPlannedMeals(date)]);

  if (template.length === 0) return { ok: false, reason: "no-template" };
  if (existing.length > 0) return { ok: false, reason: "already-planned" };

  const { library } = await getMealLibrary();

  const meals: NewPlannedMeal[] = [];
  for (const entry of template) {
    const variant = findMealVariant(library.meals, entry.meal_key, entry.variant);
    if (!variant) {
      console.warn(`[today] default ${dayType}: meal "${entry.meal_key}" is no longer in the sheet, skipping`);
      continue;
    }
    const portions = entry.portions;
    meals.push({
      plan_date: date,
      slot: entry.slot,
      position: entry.position,
      source: "sheet",
      status: "planned",
      meal_key: variant.mealKey,
      meal_name: variant.name,
      variant: variant.variant,
      portions,
      // Snapshot for the whole planned amount, so history survives sheet edits.
      kcal: Math.round(variant.kcal * portions),
      protein_g: Math.round(variant.protein_g * portions * 10) / 10,
      fat_g: Math.round(variant.fat_g * portions * 10) / 10,
      carbs_g: Math.round(variant.carbs_g * portions * 10) / 10,
    });
  }

  if (meals.length === 0) return { ok: false, reason: "no-meals-resolved" };

  await upsertDayPlan(date, dayType);
  await addPlannedMeals(meals);
  return { ok: true, created: meals.length };
}

/** Meals counted towards "eaten today". */
export function eatenMeals(meals: PlannedMeal[]): PlannedMeal[] {
  return meals.filter((meal) => meal.status === "eaten");
}

/** The next meal to eat: first one still planned, in plan order. */
export function nextMeal(meals: PlannedMeal[]): PlannedMeal | undefined {
  return meals.find((meal) => meal.status === "planned");
}
