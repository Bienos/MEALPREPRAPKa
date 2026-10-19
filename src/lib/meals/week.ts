import "server-only";

import { addDays, todayIso } from "@/lib/date";
import {
  addPlannedMeals,
  clearPlannedMeals,
  listDayPlans,
  listPlannedMeals,
  listPlannedMealsBetween,
  upsertDayPlan,
  type NewPlannedMeal,
  type PlannedMeal,
} from "@/lib/db/day-plans";
import type { DayType, IsoDate, Macros } from "@/lib/db/helpers";
import { getSettings, getTargets } from "@/lib/db/settings";
import { getMealLibrary } from "./library";
import { rebuildShoppingList } from "./prep";
import { planWeek, readyDayFromKey, readyDays, type ReadyDay } from "./ready-days";
import { kindOfCategory, type MealKind } from "./slots";
import { weekDates, type WeekEntry } from "./week-plan";

export type WeekView = {
  today: IsoDate;
  dates: IsoDate[];
  dayTypes: Record<IsoDate, DayType>;
  targets: Record<DayType, Macros>;
  entries: WeekEntry[];
  /** The closest ready days for each day type, to pick from. */
  proposals: Record<DayType, ReadyDay[]>;
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

/** Everything the week screen needs, in one round of reads. */
export async function loadWeek(start: IsoDate): Promise<WeekView> {
  const dates = weekDates(start);
  const end = dates[dates.length - 1];
  const [settings, targets, plans, planned, { library }] = await Promise.all([
    getSettings(),
    getTargets(),
    listDayPlans(start, end),
    listPlannedMealsBetween(start, end),
    getMealLibrary(),
  ]);

  const saved = new Map(plans.map((plan) => [plan.date, plan.day_type]));
  const kinds = new Map(library.meals.map((meal) => [meal.key, kindOfCategory(meal.category)]));

  return {
    today: todayIso(settings.timezone),
    dates,
    dayTypes: Object.fromEntries(dates.map((date) => [date, saved.get(date) ?? settings.default_day_type])),
    targets,
    entries: planned.map((meal) => toEntry(meal, kinds)),
    proposals: {
      DT: readyDays(library.meals, "DT", targets.DT),
      DNT: readyDays(library.meals, "DNT", targets.DNT),
    },
  };
}

function plannedRows(date: IsoDate, day: ReadyDay): NewPlannedMeal[] {
  return day.items.map((item, position) => ({
    plan_date: date,
    slot: item.slot,
    position,
    source: "sheet",
    status: "planned",
    meal_key: item.mealKey,
    meal_name: item.name,
    variant: item.variant,
    portions: 1,
    kcal: Math.round(item.kcal),
    protein_g: item.protein_g,
    fat_g: item.fat_g,
    carbs_g: item.carbs_g,
  }));
}

/** Only a day with nothing eaten or logged yet is replaced; a day under way is changed on the day itself. */
function replaceable(meals: Pick<PlannedMeal, "status">[]): boolean {
  return meals.every((meal) => meal.status === "planned");
}

/**
 * Puts one ready day on a date, replacing what was planned there, then
 * rebuilds the shopping list. false when the day is past or under way, or a
 * dish is gone from the sheet.
 */
export async function applyReadyDay(date: IsoDate, key: string, dayType: DayType, rebuild = true): Promise<boolean> {
  const [settings, targets, existing, { library }] = await Promise.all([
    getSettings(),
    getTargets(),
    listPlannedMeals(date),
    getMealLibrary(),
  ]);
  if (date < todayIso(settings.timezone) || !replaceable(existing)) return false;
  const day = readyDayFromKey(library.meals, key, dayType, targets[dayType]);
  if (!day) return false;

  await upsertDayPlan(date, dayType);
  await clearPlannedMeals(date);
  await addPlannedMeals(plannedRows(date, day));
  if (rebuild) await rebuildShoppingList();
  return true;
}

/**
 * The same ready day on several days ("to samo przez 2 dni, albo cały
 * tydzień"). Each day keeps its own DT/DNT, so the dish is rebuilt with that
 * day's version and target. Days that are past or under way are skipped.
 * The shopping list is rebuilt once. Returns how many days were set.
 */
export async function applyReadyDayToDays(days: { date: IsoDate; dayType: DayType }[], key: string): Promise<number> {
  let applied = 0;
  for (const { date, dayType } of days) {
    if (await applyReadyDay(date, key, dayType, false)) applied++;
  }
  if (applied > 0) await rebuildShoppingList();
  return applied;
}

/**
 * [ UŁÓŻ TYDZIEŃ ]: a ready day on every day from today that has nothing
 * planned, one meal-prep dish per block of days. Returns how many were filled.
 */
export async function fillWeekWithReadyDays(start: IsoDate): Promise<number> {
  const [week, { library }] = await Promise.all([loadWeek(start), getMealLibrary()]);
  const empty = week.dates
    .filter((date) => date >= week.today && !week.entries.some((entry) => entry.date === date))
    .map((date) => ({ date, dayType: week.dayTypes[date] }));
  const plan = planWeek(library.meals, empty, week.targets);
  if (plan.length === 0) return 0;

  await Promise.all(plan.map(({ date }) => upsertDayPlan(date, week.dayTypes[date])));
  await addPlannedMeals(plan.flatMap(({ date, day }) => plannedRows(date, day)));
  await rebuildShoppingList();
  return plan.length;
}

/** "Wyczyść dzień": takes a day's plan off, unless something was already eaten. */
export async function clearDay(date: IsoDate): Promise<boolean> {
  const [settings, existing] = await Promise.all([getSettings(), listPlannedMeals(date)]);
  if (date < todayIso(settings.timezone) || !replaceable(existing)) return false;
  await clearPlannedMeals(date);
  await rebuildShoppingList();
  return true;
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
