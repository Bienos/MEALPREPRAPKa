import "server-only";
import { z } from "zod";

import { getSupabase } from "@/lib/supabase/server";
import { dayTypeSchema, ok, rows, type DayType } from "./helpers";

const defaultDayMealSchema = z.object({
  id: z.uuid(),
  day_type: dayTypeSchema,
  slot: z.string(),
  position: z.number().int(),
  meal_key: z.string(),
  variant: dayTypeSchema.nullable(),
  portions: z.coerce.number(),
});
export type DefaultDayMeal = z.infer<typeof defaultDayMealSchema>;

export type NewDefaultDayMeal = {
  slot: string;
  position: number;
  meal_key: string;
  variant: DayType | null;
  portions?: number;
};

/** The default day template for one day type, in slot order. */
export async function listDefaultDayMeals(dayType: DayType): Promise<DefaultDayMeal[]> {
  const result = await getSupabase()
    .from("default_day_meals")
    .select("*")
    .eq("day_type", dayType)
    .order("position");
  return rows(defaultDayMealSchema, result);
}

/** Both templates at once, for screens that need to know what is configured. */
export async function listAllDefaultDayMeals(): Promise<Record<DayType, DefaultDayMeal[]>> {
  const result = await getSupabase().from("default_day_meals").select("*").order("position");
  const all = rows(defaultDayMealSchema, result);
  return {
    DT: all.filter((meal) => meal.day_type === "DT"),
    DNT: all.filter((meal) => meal.day_type === "DNT"),
  };
}

/** Replaces the whole template for one day type. Empty list clears it. */
export async function replaceDefaultDayMeals(dayType: DayType, meals: NewDefaultDayMeal[]): Promise<void> {
  const db = getSupabase();
  ok(await db.from("default_day_meals").delete().eq("day_type", dayType));
  if (meals.length > 0) {
    ok(await db.from("default_day_meals").insert(meals.map((meal) => ({ ...meal, day_type: dayType }))));
  }
}
