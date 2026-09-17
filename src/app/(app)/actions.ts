"use server";

import { refresh } from "next/cache";

import {
  getPlannedMeal,
  logAdhocMeal,
  markEaten,
  swapPlannedMeal,
  unmarkEaten,
  updatePlannedMealPortions,
  upsertDayPlan,
  type MealSource,
} from "@/lib/db/day-plans";
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
};

/**
 * Logs food eaten outside the plan. Only calories are required; a missing
 * macro is stored as zero and the entry is flagged as an estimate.
 */
export async function logOtherAction(input: LogOtherInput): Promise<void> {
  const incomplete =
    input.protein_g === undefined || input.fat_g === undefined || input.carbs_g === undefined;

  await logAdhocMeal({
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
  });
  refresh();
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
