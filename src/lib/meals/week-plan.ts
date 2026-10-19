/**
 * The week: seven days of planned meals, added up against the DT/DNT targets.
 * Every day is real planned meals (ready days from `ready-days.ts`), so Today,
 * the calendar and the shopping list all read the same thing.
 *
 * Pure helpers shared by the week screen, the Prep card and the shopping list.
 */

import { addDays } from "../date.ts";
import { weekStart } from "./calendar.ts";
import type { MealKind } from "./slots.ts";
import { sumMacros, type DayType, type Macros } from "./today-view-types.ts";

/** One entry on one day of the week, as far as the week needs it. */
export type WeekEntry = Macros & {
  id: string;
  date: string;
  mealKey: string | null;
  name: string;
  variant: DayType | null;
  status: string;
  /** null for food typed in by hand, which counts but is not a pick. */
  kind: MealKind | null;
  portions: number;
};

/** Planned, eaten or logged: what the week's total is made of. */
export function counts(entry: Pick<WeekEntry, "status">): boolean {
  return entry.status === "planned" || entry.status === "eaten" || entry.status === "adhoc";
}

/** Monday to Sunday. */
export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** The week the screen opens on: this one, but next week on a Sunday, when the weekly shop is done. */
export function defaultWeekStart(today: string): string {
  const monday = weekStart(today);
  return today === addDays(monday, 6) ? addDays(monday, 7) : monday;
}

export function weekTarget(dayTypes: DayType[], targets: Record<DayType, Macros>): Macros {
  return sumMacros(dayTypes.map((dayType) => targets[dayType]));
}

/** How close the week has to come to the target to count as matching. */
export const WEEK_TOLERANCE = 0.03;

/**
 * What the shopping list is made from: sheet meals still to eat. Each portion
 * already cooked and waiting in the fridge covers one of them.
 */
export function portionsToBuy(
  entries: Pick<WeekEntry, "date" | "status" | "mealKey" | "variant" | "portions">[],
  today: string,
  ready: Record<string, number>,
): { mealKey: string; variant: DayType | null; portions: number }[] {
  const left = { ...ready };
  const toBuy: { mealKey: string; variant: DayType | null; portions: number }[] = [];
  for (const entry of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    if (entry.status !== "planned" || !entry.mealKey || entry.date < today) continue;
    if ((left[entry.mealKey] ?? 0) > 0) {
      left[entry.mealKey] -= 1;
      continue;
    }
    toBuy.push({ mealKey: entry.mealKey, variant: entry.variant, portions: entry.portions });
  }
  return toBuy;
}
