import { listPlannedMeals } from "@/lib/db/day-plans";
import { listAllDefaultDayMeals } from "@/lib/db/default-day";
import { listAvailablePortions } from "@/lib/db/prep";
import { getSettings, getTargets } from "@/lib/db/settings";
import { addDays, longDateLabel, todayIso } from "@/lib/date";
import { hasAnthropicKey } from "@/lib/env";
import { getMealLibrary } from "@/lib/meals/library";
import { resolveDayType } from "@/lib/meals/plan";
import { findMealVariant, variantsForDayType } from "@/lib/meals/types";
import { toTodayMeal, type AddOption } from "@/lib/meals/today-view-types";
import { TodayView } from "./today-view";

// Day state must always be read fresh from Supabase.
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const settings = await getSettings();
  const date = todayIso(settings.timezone);
  const tomorrowDate = addDays(date, 1);

  // One round of reads, all in parallel. The meal library is cached.
  const [targets, today, tomorrow, plannedMeals, tomorrowMeals, templates, portions, { library }] =
    await Promise.all([
      getTargets(),
      resolveDayType(date),
      resolveDayType(tomorrowDate),
      listPlannedMeals(date),
      listPlannedMeals(tomorrowDate),
      listAllDefaultDayMeals(),
      listAvailablePortions(),
      getMealLibrary(),
    ]);

  // Prepared portions per dish; a meal counts as prepared when one matches it.
  const readyCount = new Map<string, number>();
  for (const portion of portions) {
    const key = portion.batch.meal_key;
    if (key) readyCount.set(key, (readyCount.get(key) ?? 0) + 1);
  }

  const meals = plannedMeals.map((meal) =>
    toTodayMeal(meal, meal.meal_key !== null && readyCount.has(meal.meal_key)),
  );

  // Everything "Dodaj" can log in one tap: today's variant of every sheet dish.
  const addOptions: AddOption[] = variantsForDayType(library.meals, today.dayType).map((variant) => ({
    mealKey: variant.mealKey,
    name: variant.name,
    category: variant.category,
    variant: variant.variant,
    ingredients: variant.ingredients,
    kcal: variant.kcal,
    protein_g: variant.protein_g,
    fat_g: variant.fat_g,
    carbs_g: variant.carbs_g,
    ready: readyCount.get(variant.mealKey) ?? 0,
  }));

  // Tomorrow's preview needs meal names, which live in the sheet, not Supabase.
  const tomorrowTemplate = templates[tomorrow.dayType];
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
      addOptions={addOptions}
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
