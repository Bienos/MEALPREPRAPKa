import type { PlannedMeal } from "@/lib/db/day-plans";
import type { DayType, Macros } from "@/lib/db/helpers";
import type { PrepBatch } from "@/lib/db/prep";

/**
 * Past days, assembled from what was already stored. Plain arithmetic over
 * rows: no AI, no estimates, no new source of truth. Macros come from the
 * snapshot on each meal, so a past day never changes when the sheet does.
 */

export type HistoryMeal = { name: string; kcal: number; approximate: boolean };
export type HistoryCook = { name: string; variant: DayType | null; portions: number };

export type HistoryDay = {
  date: string;
  dayType: DayType;
  eaten: Macros;
  target: Macros;
  meals: HistoryMeal[];
  cooked: HistoryCook[];
};

const EMPTY: Macros = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };

export function buildHistory({
  meals,
  batches,
  dayTypes,
  targets,
  defaultDayType,
}: {
  meals: PlannedMeal[];
  batches: PrepBatch[];
  /** Day type per date, from day_plans. Days without a plan fall back. */
  dayTypes: Record<string, DayType>;
  targets: Record<DayType, Macros>;
  defaultDayType: DayType;
}): HistoryDay[] {
  const byDate = new Map<string, { meals: PlannedMeal[]; cooked: PrepBatch[] }>();
  const bucket = (date: string) => {
    const existing = byDate.get(date);
    if (existing) return existing;
    const created = { meals: [] as PlannedMeal[], cooked: [] as PrepBatch[] };
    byDate.set(date, created);
    return created;
  };

  for (const meal of meals) bucket(meal.plan_date).meals.push(meal);
  for (const batch of batches) bucket(batch.cooked_on).cooked.push(batch);

  return [...byDate.entries()]
    .map(([date, day]) => {
      const dayType = dayTypes[date] ?? defaultDayType;
      const eaten = day.meals.reduce<Macros>(
        (total, meal) => ({
          kcal: total.kcal + meal.kcal,
          protein_g: total.protein_g + meal.protein_g,
          fat_g: total.fat_g + meal.fat_g,
          carbs_g: total.carbs_g + meal.carbs_g,
        }),
        EMPTY,
      );

      return {
        date,
        dayType,
        // Rounded once, at the end, so the row adds up to what is shown.
        eaten: {
          kcal: Math.round(eaten.kcal),
          protein_g: Math.round(eaten.protein_g),
          fat_g: Math.round(eaten.fat_g),
          carbs_g: Math.round(eaten.carbs_g),
        },
        target: targets[dayType],
        meals: day.meals.map((meal) => ({
          name: meal.meal_name,
          kcal: Math.round(meal.kcal),
          approximate: meal.approximate,
        })),
        cooked: day.cooked.map((batch) => ({
          name: batch.meal_name,
          variant: batch.variant,
          portions: batch.portions_made,
        })),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}
