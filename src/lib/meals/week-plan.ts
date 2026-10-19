/**
 * The week: pick what to eat over seven days and see it add up against the
 * DT/DNT targets. Every pick is a real planned meal on one of the days, so
 * Today, the calendar and the shopping list all read the same thing.
 *
 * Pure functions only. The week screen uses them to update instantly and the
 * server uses the same rules, so both agree on where a portion goes.
 */

import { addDays } from "../date.ts";
import { weekStart } from "./calendar.ts";
import type { MealKind } from "./slots.ts";
import { sumMacros, type DayType, type Macros } from "./today-view-types.ts";

export const WEEK_KINDS: MealKind[] = ["sniadanie", "obiad", "kolacja", "przekaska", "inne"];

export const WEEK_KIND_LABELS: Record<MealKind, string> = {
  sniadanie: "Śniadania",
  obiad: "Obiady",
  kolacja: "Kolacje",
  przekaska: "Przekąski",
  inne: "Inne",
};

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

/** One dish the week screen can add, with the version a DT and a DNT day get. */
export type WeekOption = {
  mealKey: string;
  name: string;
  category: string;
  kind: MealKind;
  /** Raw ingredient text, so search finds "Chicken Rice" by typing "kurczak". */
  ingredients: string;
  forDay: Record<DayType, Macros & { variant: DayType | null }>;
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

export function totalOf(entries: WeekEntry[]): Macros {
  return sumMacros(entries.filter(counts));
}

/** How close the week has to come to the target to count as matching. */
export const WEEK_TOLERANCE = 0.03;

export type WeekStatus = "empty" | "under" | "ok" | "over";

export function weekStatus(total: Macros, target: Macros): WeekStatus {
  if (total.kcal === 0) return "empty";
  const diff = total.kcal - target.kcal;
  if (Math.abs(diff) <= target.kcal * WEEK_TOLERANCE) return "ok";
  return diff < 0 ? "under" : "over";
}

/**
 * Where one more portion of a breakfast, a lunch... goes: the day with the
 * fewest of that kind, earliest first, so picks spread over the week. Days
 * that are over are never planned. null when the whole week is past.
 */
export function dayForNewPortion(dates: string[], entries: WeekEntry[], kind: MealKind, today: string): string | null {
  let best: string | null = null;
  let fewest = Infinity;
  for (const date of dates) {
    if (date < today) continue;
    const count = entries.filter((entry) => entry.date === date && entry.kind === kind && counts(entry)).length;
    if (count < fewest) {
      best = date;
      fewest = count;
    }
  }
  return best;
}

/** Which portion "−" takes back: the last one of that dish still to eat. Eaten food stays. */
export function entryToRemove(entries: WeekEntry[], mealKey: string, today: string): WeekEntry | null {
  let last: WeekEntry | null = null;
  for (const entry of entries) {
    if (entry.mealKey !== mealKey || entry.status !== "planned" || entry.date < today) continue;
    if (!last || entry.date >= last.date) last = entry;
  }
  return last;
}

export type WeekDish = {
  mealKey: string;
  name: string;
  kind: MealKind | null;
  /** Every portion this week, eaten ones included. */
  count: number;
  eaten: number;
};

/** The week's picks, one row per dish, in the order they first appear. */
export function weekDishes(entries: WeekEntry[]): WeekDish[] {
  const dishes = new Map<string, WeekDish>();
  for (const entry of entries) {
    if (!entry.mealKey || !counts(entry)) continue;
    const dish = dishes.get(entry.mealKey) ?? { mealKey: entry.mealKey, name: entry.name, kind: entry.kind, count: 0, eaten: 0 };
    dish.count += 1;
    if (entry.status !== "planned") dish.eaten += 1;
    dishes.set(entry.mealKey, dish);
  }
  return [...dishes.values()];
}

/** A snack the top-up can add, in the version for one day type. */
export type Snack = Macros & { mealKey: string; name: string; variant: DayType | null };

/** A gap smaller than this is close enough; nobody needs a 100 kcal snack planned. */
const TOP_UP_MIN_GAP = 150;
/** At most this many snacks go on one day; a bigger gap needs a meal, not snacks. */
const TOP_UP_PER_DAY = 2;
/** A snack may overshoot the gap by this much. */
const TOP_UP_OVERSHOOT = 60;

/**
 * [ DOPEŁNIJ ]: snacks that close the week's calorie gap. They go to the days
 * furthest below their own target, best kcal and protein fit first, and stop
 * once the week is close enough, so a big day elsewhere is taken into account.
 * Days with nothing planned are left alone: they need meals, not snacks.
 */
export function topUpPicks({
  dates,
  dayTypes,
  entries,
  targets,
  snacks,
  today,
}: {
  dates: string[];
  dayTypes: Record<string, DayType>;
  entries: WeekEntry[];
  targets: Record<DayType, Macros>;
  snacks: Record<DayType, Snack[]>;
  today: string;
}): { date: string; snack: Snack }[] {
  let weekGap = weekTarget(dates.map((date) => dayTypes[date]), targets).kcal - totalOf(entries).kcal;

  const days = dates
    .filter((date) => date >= today && entries.some((entry) => entry.date === date && counts(entry)))
    .map((date) => {
      const total = totalOf(entries.filter((entry) => entry.date === date));
      const target = targets[dayTypes[date]];
      return { date, dayType: dayTypes[date], gap: target.kcal - total.kcal, protein: target.protein_g - total.protein_g, added: 0 };
    });

  const picks: { date: string; snack: Snack }[] = [];
  while (weekGap >= TOP_UP_MIN_GAP) {
    const open = days.filter((day) => day.gap >= TOP_UP_MIN_GAP && day.added < TOP_UP_PER_DAY);
    if (open.length === 0) break;
    const day = open.reduce((most, candidate) => (candidate.gap > most.gap ? candidate : most));

    const room = Math.min(day.gap, weekGap);
    const fitting = snacks[day.dayType].filter((snack) => snack.kcal <= room + TOP_UP_OVERSHOOT);
    if (fitting.length === 0) {
      day.added = TOP_UP_PER_DAY; // nothing small enough; leave this day
      continue;
    }
    const score = (snack: Snack) =>
      Math.abs(room - snack.kcal) + Math.abs(Math.max(day.protein, 0) - snack.protein_g) * 2;
    const best = fitting.reduce((winner, candidate) =>
      score(candidate) < score(winner) || (score(candidate) === score(winner) && candidate.mealKey < winner.mealKey)
        ? candidate
        : winner,
    );

    picks.push({ date: day.date, snack: best });
    day.gap -= best.kcal;
    day.protein -= best.protein_g;
    day.added += 1;
    weekGap -= best.kcal;
  }
  return picks;
}

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
