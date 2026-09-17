import { listPlannedMeals } from "@/lib/db/day-plans";
import { listAllDefaultDayMeals } from "@/lib/db/default-day";
import { listAvailablePortions } from "@/lib/db/prep";
import { getSettings, getTargets } from "@/lib/db/settings";
import { addDays, longDateLabel, todayIso } from "@/lib/date";
import { hasAnthropicKey } from "@/lib/env";
import { getMealLibrary } from "@/lib/meals/library";
import { resolveDayType } from "@/lib/meals/plan";
import { findMealVariant } from "@/lib/meals/types";
import type { TodayMeal } from "@/lib/meals/today-view-types";
import { TodayView } from "./today-view";

// Day state must always be read fresh from Supabase.
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const settings = await getSettings();
  const date = todayIso(settings.timezone);
  const tomorrowDate = addDays(date, 1);

  const [targets, today, tomorrow, plannedMeals, tomorrowMeals, templates, portions] = await Promise.all([
    getTargets(),
    resolveDayType(date),
    resolveDayType(tomorrowDate),
    listPlannedMeals(date),
    listPlannedMeals(tomorrowDate),
    listAllDefaultDayMeals(),
    listAvailablePortions(),
  ]);

  // A meal counts as prepared when an available fridge/freezer portion matches it.
  const preparedKeys = new Set(portions.map((portion) => portion.batch.meal_key).filter(Boolean));

  const meals: TodayMeal[] = plannedMeals.map((meal) => ({
    id: meal.id,
    slot: meal.slot,
    position: meal.position,
    status: meal.status,
    mealKey: meal.meal_key,
    mealName: meal.meal_name,
    variant: meal.variant,
    portions: meal.portions,
    kcal: meal.kcal,
    protein_g: meal.protein_g,
    fat_g: meal.fat_g,
    carbs_g: meal.carbs_g,
    eatenAt: meal.eaten_at,
    prepared: meal.meal_key !== null && preparedKeys.has(meal.meal_key),
  }));

  // Tomorrow's preview needs meal names, which live in the sheet, not Supabase.
  const tomorrowTemplate = templates[tomorrow.dayType];
  const { library } = tomorrowTemplate.length > 0 ? await getMealLibrary() : { library: { meals: [] } };
  const tomorrowNames = tomorrowTemplate
    .map((entry) => findMealVariant(library.meals, entry.meal_key, entry.variant)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <TodayView
      date={date}
      dateLabel={longDateLabel(date)}
      dayType={today.dayType}
      target={targets[today.dayType]}
      initialMeals={meals}
      hasTemplate={templates[today.dayType].length > 0}
      aiEnabled={hasAnthropicKey()}
      tomorrow={{
        date: tomorrowDate,
        label: longDateLabel(tomorrowDate),
        dayType: tomorrow.dayType,
        mealNames: tomorrowNames,
        alreadyPlanned: tomorrowMeals.length > 0,
      }}
    />
  );
}
