"use server";

import { refresh } from "next/cache";

import {
  getPlannedMeal,
  markEaten,
  unmarkEaten,
  updatePlannedMealPortions,
  upsertDayPlan,
} from "@/lib/db/day-plans";
import { consumeEarliestPortion, restorePortion } from "@/lib/db/prep";
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
