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

const plannedMealSchema = macrosSchema.extend({
  id: z.uuid(),
  plan_date: isoDateSchema,
  slot: z.string(),
  position: z.number().int(),
  source: z.enum(["sheet", "manual"]),
  meal_key: z.string().nullable(),
  meal_name: z.string(),
  variant: dayTypeSchema.nullable(),
  portions: z.coerce.number(),
  portion_id: z.uuid().nullable(),
  eaten_at: z.string().nullable(),
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

export type NewPlannedMeal = Macros & {
  plan_date: IsoDate;
  slot: string;
  position?: number;
  source?: "sheet" | "manual";
  meal_key?: string | null;
  meal_name: string;
  variant?: DayType | null;
  portions?: number;
};

/** Adds a meal to a day. Macros are stored as a snapshot for the whole planned amount. */
export async function addPlannedMeal(input: NewPlannedMeal): Promise<PlannedMeal> {
  const result = await getSupabase().from("planned_meals").insert(input).select("*").single();
  return row(plannedMealSchema, result);
}

export async function removePlannedMeal(id: string): Promise<void> {
  ok(await getSupabase().from("planned_meals").delete().eq("id", id));
}

/** ZJEDZONE. Optionally records which fridge portion was eaten. */
export async function markEaten(id: string, portionId?: string): Promise<void> {
  ok(
    await getSupabase()
      .from("planned_meals")
      .update({ eaten_at: new Date().toISOString(), portion_id: portionId ?? null })
      .eq("id", id),
  );
}

export async function unmarkEaten(id: string): Promise<void> {
  ok(await getSupabase().from("planned_meals").update({ eaten_at: null, portion_id: null }).eq("id", id));
}
