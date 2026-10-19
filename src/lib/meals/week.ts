import "server-only";

import { addDays, todayIso } from "@/lib/date";
import {
  addPlannedMeals,
  listDayPlans,
  listPlannedMealsBetween,
  upsertDayPlan,
  type NewPlannedMeal,
  type PlannedMeal,
} from "@/lib/db/day-plans";
import { listAllDefaultDayMeals } from "@/lib/db/default-day";
import type { DayType, IsoDate, Macros } from "@/lib/db/helpers";
import { getSettings, getTargets } from "@/lib/db/settings";
import { getMealLibrary } from "./library";
import { applyDefaultDay } from "./plan";
import { kindOfCategory, slotNameForCategory, type MealKind } from "./slots";
import { findMealVariant, type Meal } from "./types";
import {
  topUpPicks,
  weekDates,
  type Snack,
  type WeekEntry,
  type WeekOption,
} from "./week-plan";

export type WeekView = {
  today: IsoDate;
  dates: IsoDate[];
  dayTypes: Record<IsoDate, DayType>;
  targets: Record<DayType, Macros>;
  entries: WeekEntry[];
  options: WeekOption[];
  /** A default day exists to fill empty days from. */
  hasTemplate: Record<DayType, boolean>;
};

function toEntry(meal: PlannedMeal, kinds: Map<string, MealKind>): WeekEntry {
  return {
    id: meal.id,
    date: meal.plan_date,
    mealKey: meal.meal_key,
    name: meal.meal_name,
    variant: meal.variant,
    status: meal.status,
    kind: meal.meal_key ? (kinds.get(meal.meal_key) ?? null) : null,
    portions: meal.portions,
    kcal: meal.kcal,
    protein_g: meal.protein_g,
    fat_g: meal.fat_g,
    carbs_g: meal.carbs_g,
  };
}

function toOption(meal: Meal): WeekOption {
  const version = (dayType: DayType) => {
    const variant = findMealVariant([meal], meal.key, dayType)!;
    return {
      variant: variant.variant,
      kcal: variant.kcal,
      protein_g: variant.protein_g,
      fat_g: variant.fat_g,
      carbs_g: variant.carbs_g,
    };
  };
  return {
    mealKey: meal.key,
    name: meal.name,
    category: meal.category,
    kind: kindOfCategory(meal.category),
    ingredients: meal.variants[0]?.ingredients ?? "",
    forDay: { DT: version("DT"), DNT: version("DNT") },
  };
}

/** Everything the week screen needs, in one round of reads. */
export async function loadWeek(start: IsoDate): Promise<WeekView> {
  const dates = weekDates(start);
  const end = dates[dates.length - 1];
  const [settings, targets, plans, planned, { library }, templates] = await Promise.all([
    getSettings(),
    getTargets(),
    listDayPlans(start, end),
    listPlannedMealsBetween(start, end),
    getMealLibrary(),
    listAllDefaultDayMeals(),
  ]);

  const saved = new Map(plans.map((plan) => [plan.date, plan.day_type]));
  const kinds = new Map(library.meals.map((meal) => [meal.key, kindOfCategory(meal.category)]));

  return {
    today: todayIso(settings.timezone),
    dates,
    dayTypes: Object.fromEntries(dates.map((date) => [date, saved.get(date) ?? settings.default_day_type])),
    targets,
    entries: planned.map((meal) => toEntry(meal, kinds)),
    options: library.meals.map(toOption),
    hasTemplate: { DT: templates.DT.length > 0, DNT: templates.DNT.length > 0 },
  };
}

/**
 * Plans several dishes at once, each on its day in that day's DT/DNT version,
 * after what the day already has. One insert, so a top-up lands in one go.
 */
async function planDishes(week: WeekView, picks: { date: IsoDate; mealKey: string }[], meals: Meal[]): Promise<number> {
  if (picks.length === 0) return 0;
  // Each new entry goes after the last one already on its day.
  const lastPosition = new Map<string, number>();
  for (const meal of await listPlannedMealsBetween(week.dates[0], week.dates[week.dates.length - 1])) {
    lastPosition.set(meal.plan_date, Math.max(lastPosition.get(meal.plan_date) ?? -1, meal.position));
  }

  const rows: NewPlannedMeal[] = [];
  for (const pick of picks) {
    const variant = findMealVariant(meals, pick.mealKey, week.dayTypes[pick.date]);
    if (!variant) continue;
    const position = (lastPosition.get(pick.date) ?? -1) + 1;
    lastPosition.set(pick.date, position);
    rows.push({
      plan_date: pick.date,
      slot: slotNameForCategory(variant.category),
      position,
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
  }
  if (rows.length === 0) return 0;

  // A meal needs its day saved first; saving also pins the day's DT/DNT.
  const days = [...new Set(rows.map((row) => row.plan_date))];
  await Promise.all(days.map((date) => upsertDayPlan(date, week.dayTypes[date])));
  await addPlannedMeals(rows);
  return rows.length;
}

/** [ DOPEŁNIJ ]: snacks that close the week's calorie gap. Returns how many were added. */
export async function topUpWeek(start: IsoDate): Promise<number> {
  const [week, { library }] = await Promise.all([loadWeek(start), getMealLibrary()]);
  const snacksFor = (dayType: DayType): Snack[] =>
    week.options
      .filter((option) => option.kind === "przekaska")
      .map((option) => ({ mealKey: option.mealKey, name: option.name, ...option.forDay[dayType] }));

  const picks = topUpPicks({
    dates: week.dates,
    dayTypes: week.dayTypes,
    entries: week.entries,
    targets: week.targets,
    snacks: { DT: snacksFor("DT"), DNT: snacksFor("DNT") },
    today: week.today,
  });
  return planDishes(week, picks.map((pick) => ({ date: pick.date, mealKey: pick.snack.mealKey })), library.meals);
}

/** Puts the default DT/DNT day on every day of the week that has nothing yet. */
export async function fillWeekWithDefaults(start: IsoDate): Promise<number> {
  const week = await loadWeek(start);
  let filled = 0;
  for (const date of week.dates) {
    if (date < week.today || week.entries.some((entry) => entry.date === date)) continue;
    const result = await applyDefaultDay(date, week.dayTypes[date]);
    if (result.ok) filled += 1;
  }
  return filled;
}

/** "19–25 października", "28 września – 4 października". */
export function weekRangeLabel(start: IsoDate): string {
  const end = addDays(start, 6);
  const format = (date: string, withMonth: boolean) => {
    const [y, m, d] = date.split("-").map(Number);
    return new Intl.DateTimeFormat("pl-PL", {
      day: "numeric",
      ...(withMonth ? { month: "long" } : {}),
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  };
  return start.slice(0, 7) === end.slice(0, 7)
    ? `${format(start, false)}–${format(end, true)}`
    : `${format(start, true)} – ${format(end, true)}`;
}
