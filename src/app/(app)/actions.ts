"use server";

import { refresh } from "next/cache";

import {
  addPlannedMeal,
  getPlannedMeal,
  listPlannedMeals,
  logAdhocMeal,
  markEaten,
  removePlannedMeal,
  swapPlannedMeal,
  unmarkEaten,
  updatePlannedMeal,
  updatePlannedMealPortions,
  upsertDayPlan,
  type MealSource,
} from "@/lib/db/day-plans";
import { getSettings } from "@/lib/db/settings";
import { todayIso } from "@/lib/date";
import { getMealLibrary } from "@/lib/meals/library";
import { resolveDayType } from "@/lib/meals/plan";
import { findMealVariant } from "@/lib/meals/types";
import { toTodayMeal, type Macros, type TodayMeal } from "@/lib/meals/today-view-types";
import { consumeEarliestPortion, restorePortion } from "@/lib/db/prep";
import { estimateFood, hasAiEstimation, type FoodEstimate } from "@/lib/meals/ai-estimate";
import {
  dinnerOutFor,
  noCookFor,
  rebalanceDay,
  savedMealChoices,
  swapsFor,
} from "@/lib/meals/exceptions";
import type { Candidate, NoCookOption } from "@/lib/meals/recommend";
import type { Suggestion } from "@/lib/meals/rebalance";
import type { DayType } from "@/lib/db/helpers";
import { applyDefaultDay, type ApplyDefaultDayResult } from "@/lib/meals/plan";

export type ActionResult = { ok: boolean; message?: string };

/** One-tap DT/DNT switch for a date. Existing planned meals are left untouched. */
export async function setDayTypeAction(date: string, dayType: DayType): Promise<void> {
  await upsertDayPlan(date, dayType);
  refresh();
}

const APPLY_ERRORS: Record<Exclude<ApplyDefaultDayResult, { ok: true }>["reason"], string> = {
  "no-template": "Nie masz jeszcze domyślnego dnia. Ustaw go najpierw.",
  "already-planned": "Ten dzień ma już zaplanowane posiłki.",
  "no-meals-resolved": "Posiłków z domyślnego dnia nie ma już w arkuszu.",
};

/** [ UŻYJ DOMYŚLNEGO DT/DNT ] — fills the day from its template in one tap. */
export async function applyDefaultDayAction(date: string, dayType: DayType): Promise<ActionResult> {
  const result = await applyDefaultDay(date, dayType);
  refresh();
  return result.ok ? { ok: true } : { ok: false, message: APPLY_ERRORS[result.reason] };
}

/**
 * ZJEDZONE. The screen updates optimistically before this resolves, so this
 * deliberately does not call refresh(): the client already holds the new state.
 *
 * If a prepared portion of the same meal is in the fridge, one is consumed
 * automatically (earliest expiry first) so the fridge never needs hand-editing.
 */
export async function markEatenAction(id: string): Promise<void> {
  const meal = await getPlannedMeal(id);
  const portionId = meal?.meal_key ? await consumeEarliestPortion(meal.meal_key, meal.variant) : null;
  await markEaten(id, portionId ?? undefined);
}

/** Undo for ZJEDZONE, which also puts any auto-consumed portion back. */
export async function undoEatenAction(id: string): Promise<void> {
  const meal = await getPlannedMeal(id);
  if (meal?.portion_id) await restorePortion(meal.portion_id);
  await unmarkEaten(id);
}

/** Portion override for one day's meal. Never touches the sheet or the recipe. */
export async function setPortionsAction(id: string, portions: number): Promise<void> {
  await updatePlannedMealPortions(id, portions);
}

/**
 * Hand edit from the meal sheet on Today: portion and macros exactly as typed.
 * Like ZJEDZONE, the screen already shows the result, so there is no refresh.
 */
export async function updateMealAction(id: string, patch: Macros & { portions: number }): Promise<void> {
  await updatePlannedMeal(id, patch);
}

/** Takes one entry off today's list, putting back any fridge portion it used. */
export async function removeMealAction(id: string): Promise<void> {
  const meal = await getPlannedMeal(id);
  if (meal?.portion_id) await restorePortion(meal.portion_id);
  await removePlannedMeal(id);
}

/**
 * "Dodaj do dziś" from the meal library: plans one portion of the dish for
 * today, in the variant matching today's day type, after what is already there.
 */
export async function addToTodayAction(mealKey: string): Promise<ActionResult> {
  const settings = await getSettings();
  const date = todayIso(settings.timezone);
  const [{ library }, { dayType }, existing] = await Promise.all([
    getMealLibrary(),
    resolveDayType(date),
    listPlannedMeals(date),
  ]);
  const variant = findMealVariant(library.meals, mealKey, dayType);
  if (!variant) return { ok: false, message: "Tego posiłku nie ma już w arkuszu." };

  await upsertDayPlan(date, dayType);
  await addPlannedMeal({
    plan_date: date,
    slot: variant.category,
    position: existing.length > 0 ? Math.max(...existing.map((meal) => meal.position)) + 1 : 0,
    source: "sheet",
    status: "planned",
    meal_key: variant.mealKey,
    meal_name: variant.name,
    variant: variant.variant,
    portions: 1,
    kcal: Math.round(variant.kcal),
    protein_g: variant.protein_g,
    fat_g: variant.fat_g,
    carbs_g: variant.carbs_g,
  });
  return { ok: true };
}


/* Exception workflows ------------------------------------------------------- */

/** [ ZAMIEŃ ]: at most three ranked alternatives for one planned meal. */
export async function swapOptionsAction(
  mealId: string,
  date: string,
  dayType: DayType,
): Promise<Candidate[]> {
  return swapsFor(mealId, date, dayType);
}

/** Applies a swap, keeping the meal's slot, order and portion multiplier. */
export async function applySwapAction(mealId: string, candidate: Candidate): Promise<void> {
  await swapPlannedMeal(mealId, {
    meal_key: candidate.mealKey,
    meal_name: candidate.mealName,
    variant: candidate.variant,
    kcal: candidate.kcal,
    protein_g: candidate.protein_g,
    fat_g: candidate.fat_g,
    carbs_g: candidate.carbs_g,
  });
  refresh();
}

/** Meals offered first in "Zjadłem coś innego" → zapisany posiłek. */
export async function savedMealsAction(dayType: DayType): Promise<Candidate[]> {
  return savedMealChoices(dayType);
}

export type LogOtherInput = {
  date: string;
  name: string;
  source: MealSource;
  kcal: number;
  protein_g?: number;
  fat_g?: number;
  carbs_g?: number;
  mealKey?: string | null;
  variant?: DayType | null;
  approximate?: boolean;
  /** Take one prepared portion of this meal out of the fridge. */
  fromFridge?: boolean;
};

/**
 * Logs food eaten outside the plan. Only calories are required; a missing
 * macro is stored as zero and the entry is flagged as an estimate.
 */
export async function logOtherAction(input: LogOtherInput): Promise<TodayMeal> {
  const incomplete =
    input.protein_g === undefined || input.fat_g === undefined || input.carbs_g === undefined;
  const portionId =
    input.fromFridge && input.mealKey ? await consumeEarliestPortion(input.mealKey, input.variant ?? null) : null;

  const logged = await logAdhocMeal({
    plan_date: input.date,
    meal_name: input.name,
    source: input.source,
    meal_key: input.mealKey ?? null,
    variant: input.variant ?? null,
    kcal: input.kcal,
    protein_g: input.protein_g ?? 0,
    fat_g: input.fat_g ?? 0,
    carbs_g: input.carbs_g ?? 0,
    approximate: input.approximate ?? incomplete,
    portion_id: portionId,
  });
  // The screen adds the returned entry itself; no refresh needed.
  return toTodayMeal(logged);
}

export type EstimateResult =
  | { ok: true; estimate: FoodEstimate }
  | { ok: false; message: string };

/** Natural-language estimate. Absent key is reported, never thrown at the user. */
export async function estimateFoodAction(description: string): Promise<EstimateResult> {
  if (!hasAiEstimation()) {
    return { ok: false, message: "Szacowanie AI nie jest skonfigurowane." };
  }
  try {
    const estimate = await estimateFood(description);
    if (!estimate) return { ok: false, message: "Szacowanie AI nie jest skonfigurowane." };
    return { ok: true, estimate };
  } catch (error) {
    console.error("[ai-estimate]", error);
    return { ok: false, message: "Nie udało się oszacować. Wpisz kalorie ręcznie." };
  }
}

/** [ PRZELICZ RESZTĘ DNIA ] */
export async function rebalanceAction(date: string, dayType: DayType) {
  return rebalanceDay(date, dayType);
}

/** [ NIE CHCE MI SIĘ GOTOWAĆ ] */
export async function noCookAction(
  date: string,
  dayType: DayType,
): Promise<{ remaining: { kcal: number; protein_g: number; fat_g: number; carbs_g: number }; options: NoCookOption[] }> {
  return noCookFor(date, dayType);
}

/** [ ZOSTAW KALORIE NA KOLACJĘ ] */
export async function dinnerOutAction(
  date: string,
  dayType: DayType,
  reserve: number,
  preserveProtein: boolean,
): Promise<{ suggestions: Suggestion[]; freed: number; needed: number }> {
  return dinnerOutFor(date, dayType, reserve, preserveProtein);
}

/** Applies one suggested correction from rebalance or dinner-out. */
export async function applySuggestionAction(suggestion: Suggestion): Promise<void> {
  if (suggestion.kind === "swap") {
    await swapPlannedMeal(suggestion.meal.id, {
      meal_key: suggestion.to.mealKey,
      meal_name: suggestion.to.mealName,
      variant: suggestion.to.variant,
      kcal: suggestion.to.kcal,
      protein_g: suggestion.to.protein_g,
      fat_g: suggestion.to.fat_g,
      carbs_g: suggestion.to.carbs_g,
    });
  } else if (suggestion.kind === "portion") {
    await updatePlannedMealPortions(suggestion.meal.id, suggestion.portions);
  }
  // A correction block is food to add, so it is logged rather than applied.
  refresh();
}
