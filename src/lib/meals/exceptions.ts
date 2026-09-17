import "server-only";

import {
  listPlannedMeals,
  mealFrequency,
  type PlannedMeal,
} from "@/lib/db/day-plans";
import { listAvailablePortions } from "@/lib/db/prep";
import { getTargets } from "@/lib/db/settings";
import type { DayType } from "@/lib/db/helpers";
import { getMealLibrary } from "./library";
import { noCookOptions, rankSwaps, type Candidate, type NoCookOption, type ReadyPortion } from "./recommend";
import {
  planDinnerOut,
  projectDay,
  suggestCorrections,
  type DayMeal,
  type Projection,
  type Suggestion,
} from "./rebalance";

/** Fridge and freezer stock in the shape the ranking module expects. */
export async function readyPortions(): Promise<ReadyPortion[]> {
  const portions = await listAvailablePortions();
  const today = new Date();
  const grouped = new Map<string, ReadyPortion>();

  for (const portion of portions) {
    const mealKey = portion.batch.meal_key;
    if (!mealKey) continue;
    const key = `${mealKey}|${portion.batch.variant ?? ""}|${portion.location}`;
    const daysLeft = portion.expires_on
      ? Math.round((Date.parse(`${portion.expires_on}T00:00:00Z`) - Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate(),
        )) / 86_400_000)
      : null;

    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      if (daysLeft !== null && (existing.daysLeft === null || daysLeft < existing.daysLeft)) {
        existing.daysLeft = daysLeft;
      }
    } else {
      grouped.set(key, {
        mealKey,
        variant: portion.batch.variant,
        count: 1,
        daysLeft,
        location: portion.location,
      });
    }
  }
  return [...grouped.values()];
}

function toDayMeals(meals: PlannedMeal[]): DayMeal[] {
  return meals.map((meal) => ({
    id: meal.id,
    mealKey: meal.meal_key,
    mealName: meal.meal_name,
    slot: meal.slot,
    status: meal.status,
    portions: meal.portions,
    kcal: meal.kcal,
    protein_g: meal.protein_g,
    fat_g: meal.fat_g,
    carbs_g: meal.carbs_g,
  }));
}

/** Best swaps for one planned meal: at most three, fridge food first. */
export async function swapsFor(mealId: string, date: string, dayType: DayType): Promise<Candidate[]> {
  const [{ library }, meals, portions, frequency] = await Promise.all([
    getMealLibrary(),
    listPlannedMeals(date),
    readyPortions(),
    mealFrequency(),
  ]);

  const meal = meals.find((candidate) => candidate.id === mealId);
  if (!meal) return [];

  return rankSwaps({
    meals: library.meals,
    dayType,
    // Aim at what this meal currently contributes, so the day stays balanced.
    targetKcal: meal.kcal / meal.portions,
    targetProtein: meal.protein_g / meal.portions,
    excludeKeys: meal.meal_key ? [meal.meal_key] : [],
    portions,
    frequency,
    limit: 3,
  });
}

/** Meals from the sheet offered as "saved meal", most used first. */
export async function savedMealChoices(dayType: DayType, limit = 8): Promise<Candidate[]> {
  const [{ library }, frequency, portions] = await Promise.all([
    getMealLibrary(),
    mealFrequency(),
    readyPortions(),
  ]);

  const used = Object.entries(frequency).sort((a, b) => b[1] - a[1]);
  const recentKeys = used.slice(0, limit).map(([key]) => key);
  const recent = library.meals.filter((meal) => recentKeys.includes(meal.key));
  // Fall back to the library's own order when nothing has been eaten yet.
  const pool = recent.length >= limit ? recent : [...recent, ...library.meals.filter((meal) => !recentKeys.includes(meal.key))];

  return rankSwaps({
    meals: pool.slice(0, limit * 3),
    dayType,
    targetKcal: 600,
    targetProtein: 45,
    portions,
    frequency,
    limit,
  });
}

export type RebalanceResult = { projection: Projection; suggestions: Suggestion[] };

/** "Przelicz resztę dnia" for a date. */
export async function rebalanceDay(date: string, dayType: DayType): Promise<RebalanceResult> {
  const [{ library }, targets, meals, portions, frequency] = await Promise.all([
    getMealLibrary(),
    getTargets(),
    listPlannedMeals(date),
    readyPortions(),
    mealFrequency(),
  ]);

  return suggestCorrections({
    target: targets[dayType],
    meals: toDayMeals(meals),
    library: library.meals,
    dayType,
    portions,
    frequency,
  });
}

/** NIE CHCE MI SIĘ GOTOWAĆ: three options against what is left of the day. */
export async function noCookFor(
  date: string,
  dayType: DayType,
): Promise<{ remaining: Projection["remaining"]; options: NoCookOption[] }> {
  const [{ library }, targets, meals, portions, frequency] = await Promise.all([
    getMealLibrary(),
    getTargets(),
    listPlannedMeals(date),
    readyPortions(),
    mealFrequency(),
  ]);

  const projection = projectDay(targets[dayType], toDayMeals(meals));
  return {
    remaining: projection.remaining,
    options: noCookOptions({
      meals: library.meals,
      dayType,
      remainingKcal: Math.max(projection.remaining.kcal, 0),
      remainingProtein: Math.max(projection.remaining.protein_g, 0),
      portions,
      frequency,
    }),
  };
}

/** "Zostaw kalorie na kolację": free up roughly `reserve` kcal. */
export async function dinnerOutFor(
  date: string,
  dayType: DayType,
  reserve: number,
  preserveProtein: boolean,
): Promise<{ suggestions: Suggestion[]; freed: number; needed: number }> {
  const [targets, meals] = await Promise.all([getTargets(), listPlannedMeals(date)]);
  return planDinnerOut({
    target: targets[dayType],
    meals: toDayMeals(meals),
    reserve,
    preserveProtein,
  });
}
