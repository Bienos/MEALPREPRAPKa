import "server-only";
import { z } from "zod";

import { getSupabase } from "@/lib/supabase/server";
import {
  dayTypeSchema,
  isoDateSchema,
  macrosSchema,
  maybeRow,
  ok,
  row,
  rows,
  type DayType,
  type IsoDate,
  type Macros,
} from "./helpers";

const dayPlanSchema = z.object({
  date: isoDateSchema,
  day_type: dayTypeSchema,
  note: z.string().nullable(),
});
export type DayPlan = z.infer<typeof dayPlanSchema>;

export const mealStatuses = ["planned", "eaten", "skipped", "swapped", "adhoc"] as const;
export type MealStatus = (typeof mealStatuses)[number];

/** Where a logged meal came from. Ad-hoc entries keep their origin for history. */
export const mealSources = ["sheet", "manual", "saved_meal", "quick_add", "ai_estimate"] as const;
export type MealSource = (typeof mealSources)[number];

const plannedMealSchema = macrosSchema.extend({
  id: z.uuid(),
  plan_date: isoDateSchema,
  slot: z.string(),
  position: z.number().int(),
  status: z.enum(mealStatuses),
  source: z.enum(mealSources),
  meal_key: z.string().nullable(),
  meal_name: z.string(),
  variant: dayTypeSchema.nullable(),
  portions: z.coerce.number(),
  portion_id: z.uuid().nullable(),
  eaten_at: z.string().nullable(),
  /** True when the macros are an estimate, shown in the UI with "~". */
  approximate: z.boolean(),
});
export type PlannedMeal = z.infer<typeof plannedMealSchema>;

export async function getDayPlan(date: IsoDate): Promise<DayPlan | null> {
  const result = await getSupabase().from("day_plans").select("*").eq("date", date).maybeSingle();
  return maybeRow(dayPlanSchema, result);
}

/** Creates the plan for a date or changes its day type. */
export async function upsertDayPlan(date: IsoDate, dayType: DayType): Promise<DayPlan> {
  const result = await getSupabase()
    .from("day_plans")
    .upsert({ date, day_type: dayType })
    .select("*")
    .single();
  return row(dayPlanSchema, result);
}

export async function listDayPlans(from: IsoDate, to: IsoDate): Promise<DayPlan[]> {
  const result = await getSupabase()
    .from("day_plans")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("date");
  return rows(dayPlanSchema, result);
}

export async function listPlannedMeals(date: IsoDate): Promise<PlannedMeal[]> {
  const result = await getSupabase()
    .from("planned_meals")
    .select("*")
    .eq("plan_date", date)
    .order("position");
  return rows(plannedMealSchema, result);
}

export async function getPlannedMeal(id: string): Promise<PlannedMeal | null> {
  const result = await getSupabase().from("planned_meals").select("*").eq("id", id).maybeSingle();
  return maybeRow(plannedMealSchema, result);
}

export type NewPlannedMeal = Macros & {
  plan_date: IsoDate;
  slot: string;
  position?: number;
  source?: MealSource;
  meal_key?: string | null;
  meal_name: string;
  variant?: DayType | null;
  portions?: number;
  status?: MealStatus;
  approximate?: boolean;
};

/** Adds a meal to a day. Macros are stored as a snapshot for the whole planned amount. */
export async function addPlannedMeal(input: NewPlannedMeal): Promise<PlannedMeal> {
  const result = await getSupabase().from("planned_meals").insert(input).select("*").single();
  return row(plannedMealSchema, result);
}

/** Adds several meals at once, e.g. when applying a default day. */
export async function addPlannedMeals(meals: NewPlannedMeal[]): Promise<void> {
  if (meals.length === 0) return;
  ok(await getSupabase().from("planned_meals").insert(meals));
}

export async function removePlannedMeal(id: string): Promise<void> {
  ok(await getSupabase().from("planned_meals").delete().eq("id", id));
}

/** Removes every meal planned for a date, leaving the day plan itself. */
export async function clearPlannedMeals(date: IsoDate): Promise<void> {
  ok(await getSupabase().from("planned_meals").delete().eq("plan_date", date));
}

/** ZJEDZONE. Optionally records which fridge portion was eaten. */
export async function markEaten(id: string, portionId?: string): Promise<void> {
  ok(
    await getSupabase()
      .from("planned_meals")
      .update({ status: "eaten", eaten_at: new Date().toISOString(), portion_id: portionId ?? null })
      .eq("id", id),
  );
}

/** Undo for ZJEDZONE. */
export async function unmarkEaten(id: string): Promise<void> {
  ok(
    await getSupabase()
      .from("planned_meals")
      .update({ status: "planned", eaten_at: null, portion_id: null })
      .eq("id", id),
  );
}

/**
 * ZAMIEŃ: points a planned meal at a different dish, keeping its slot and
 * order and taking a fresh macro snapshot. The sheet is never touched.
 */
export async function swapPlannedMeal(
  id: string,
  replacement: {
    meal_key: string;
    meal_name: string;
    variant: DayType | null;
    kcal: number;
    protein_g: number;
    fat_g: number;
    carbs_g: number;
  },
): Promise<PlannedMeal> {
  const db = getSupabase();
  const current = row(plannedMealSchema, await db.from("planned_meals").select("*").eq("id", id).single());
  if (current.status !== "planned") throw new Error("Only a meal that has not been eaten can be swapped");

  // Macros scale with whatever portion multiplier the meal already had.
  const factor = current.portions;
  const result = await db
    .from("planned_meals")
    .update({
      meal_key: replacement.meal_key,
      meal_name: replacement.meal_name,
      variant: replacement.variant,
      source: "sheet",
      approximate: false,
      kcal: Math.round(replacement.kcal * factor),
      protein_g: Math.round(replacement.protein_g * factor * 10) / 10,
      fat_g: Math.round(replacement.fat_g * factor * 10) / 10,
      carbs_g: Math.round(replacement.carbs_g * factor * 10) / 10,
    })
    .eq("id", id)
    .select("*")
    .single();
  return row(plannedMealSchema, result);
}

/**
 * Food eaten outside the plan. Stored in planned_meals so the day's totals,
 * history and macro snapshots all work the same way as for planned food.
 */
export async function logAdhocMeal(input: {
  plan_date: IsoDate;
  meal_name: string;
  source: MealSource;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  meal_key?: string | null;
  variant?: DayType | null;
  approximate?: boolean;
  slot?: string;
}): Promise<PlannedMeal> {
  const db = getSupabase();
  const existing = await listPlannedMeals(input.plan_date);
  const result = await db
    .from("planned_meals")
    .insert({
      plan_date: input.plan_date,
      slot: input.slot ?? "Poza planem",
      // Ad-hoc food lands at the end of the day's list.
      position: existing.length > 0 ? Math.max(...existing.map((meal) => meal.position)) + 1 : 0,
      status: "adhoc",
      source: input.source,
      meal_key: input.meal_key ?? null,
      meal_name: input.meal_name,
      variant: input.variant ?? null,
      approximate: input.approximate ?? false,
      portions: 1,
      kcal: Math.round(input.kcal),
      protein_g: Math.round(input.protein_g * 10) / 10,
      fat_g: Math.round(input.fat_g * 10) / 10,
      carbs_g: Math.round(input.carbs_g * 10) / 10,
      eaten_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  return row(plannedMealSchema, result);
}

/** How often each sheet meal has been eaten, as a preference signal. */
export async function mealFrequency(limit = 400): Promise<Record<string, number>> {
  const result = await getSupabase()
    .from("planned_meals")
    .select("meal_key,status")
    .in("status", ["eaten", "adhoc"])
    .limit(limit);
  if (result.error) throw new Error(`Database error: ${result.error.message}`);

  const counts: Record<string, number> = {};
  for (const item of (result.data ?? []) as { meal_key: string | null }[]) {
    if (!item.meal_key) continue;
    counts[item.meal_key] = (counts[item.meal_key] ?? 0) + 1;
  }
  return counts;
}

export async function setMealStatus(id: string, status: MealStatus): Promise<void> {
  ok(await getSupabase().from("planned_meals").update({ status }).eq("id", id));
}

/**
 * Changes the portion multiplier and rescales the stored macro snapshot by the
 * same ratio. The sheet and the meal library are never touched: only this one
 * day's planned meal changes.
 */
export async function updatePlannedMealPortions(id: string, portions: number): Promise<PlannedMeal> {
  if (!(portions > 0)) throw new Error("portions must be greater than 0");
  const db = getSupabase();
  const current = row(plannedMealSchema, await db.from("planned_meals").select("*").eq("id", id).single());

  const ratio = portions / current.portions;
  const result = await db
    .from("planned_meals")
    .update({
      portions,
      kcal: Math.round(current.kcal * ratio),
      protein_g: Math.round(current.protein_g * ratio * 10) / 10,
      fat_g: Math.round(current.fat_g * ratio * 10) / 10,
      carbs_g: Math.round(current.carbs_g * ratio * 10) / 10,
    })
    .eq("id", id)
    .select("*")
    .single();
  return row(plannedMealSchema, result);
}
