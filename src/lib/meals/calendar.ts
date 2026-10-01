/**
 * The calendar month, assembled from what is already stored. Plain
 * arithmetic over rows: no estimates and no new source of truth. A day's
 * numbers come from the snapshot on each entry, so a past day never changes
 * when the sheet does.
 */

import { addDays } from "../date.ts";

type DayType = "DT" | "DNT";
type Macros = { kcal: number; protein_g: number; fat_g: number; carbs_g: number };

export type CalendarEntry = Macros & { plan_date: string; status: string };

/** How a finished day went against its target. */
export type Tone = "low" | "ok" | "high";

export type CalendarCell = {
  date: string;
  /** Day of the month, 1-31. */
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  dayType: DayType | null;
  /** Eaten so far for today and past days, planned for future days. */
  kcal: number;
  /** Share of the day's calorie target, 0 to 1.3 (capped so a bar stays inside its cell). */
  fill: number;
  /** Only finished days get a verdict; today is still in progress. */
  tone: Tone | null;
  /** Something is on the day's list. */
  hasEntries: boolean;
  /** A prep was cooked that day. */
  cooked: boolean;
};

export type MonthStats = {
  /** Finished days with anything eaten. */
  loggedDays: number;
  avgKcal: number;
  avgProtein: number;
  /** Logged days within 10% of the calorie target. */
  onTargetDays: number;
};

export type Month = { weeks: CalendarCell[][]; stats: MonthStats };

const EATEN = new Set(["eaten", "adhoc"]);

/** Below this share of the target a day reads as "low" (most likely not fully logged). */
const LOW = 0.75;
/** Above this share it reads as "high". */
const HIGH = 1.1;

export function toneFor(kcal: number, target: number): Tone {
  const share = kcal / target;
  return share < LOW ? "low" : share > HIGH ? "high" : "ok";
}

/** The Monday that starts the week containing `date`. */
function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

/** First and last day of a `YYYY-MM` month. */
export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first, last };
}

/** The first and last date shown in the grid, which reaches into the neighbouring months. */
export function gridBounds(month: string): { from: string; to: string } {
  const { first, last } = monthBounds(month);
  const from = weekStart(first);
  return { from, to: addDays(weekStart(last), 6) };
}

/** `2026-10` shifted by whole months. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1 + by, 1));
  return shifted.toISOString().slice(0, 7);
}

type DayInputs = {
  today: string;
  entries: CalendarEntry[];
  /** Day type per date, from the saved day plans. */
  dayTypes: Record<string, DayType>;
  /** Dates a prep was cooked. */
  cookedOn: Set<string>;
  targets: Record<DayType, Macros>;
  defaultDayType: DayType;
};

export type DayCell = CalendarCell & {
  /** The saved type, or the default the day would get. */
  effectiveType: DayType;
  protein: number;
  targetKcal: number;
};

/**
 * One cell per day from `from` to `to`, inclusive. The calendar grid and the
 * strip of days on Today are both built from this. `month`, when given,
 * marks which days belong to it.
 */
export function buildDays({
  from,
  to,
  month,
  today,
  entries,
  dayTypes,
  cookedOn,
  targets,
  defaultDayType,
}: DayInputs & { from: string; to: string; month?: string }): DayCell[] {
  const byDate = new Map<string, CalendarEntry[]>();
  for (const entry of entries) byDate.set(entry.plan_date, [...(byDate.get(entry.plan_date) ?? []), entry]);

  const cells: DayCell[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const day = byDate.get(date) ?? [];
    const isFuture = date > today;
    const isToday = date === today;
    const dayType = dayTypes[date] ?? null;
    const effectiveType = dayType ?? defaultDayType;
    const target = targets[effectiveType];

    const counted = isFuture ? day.filter((e) => e.status !== "skipped") : day.filter((e) => EATEN.has(e.status));
    const kcal = Math.round(counted.reduce((sum, e) => sum + e.kcal, 0));
    const finished = !isFuture && !isToday && kcal > 0;

    cells.push({
      date,
      day: Number(date.slice(8)),
      inMonth: month ? date.startsWith(month) : true,
      isToday,
      isFuture,
      dayType,
      effectiveType,
      kcal,
      protein: counted.reduce((sum, e) => sum + e.protein_g, 0),
      targetKcal: target.kcal,
      fill: Math.min(kcal / target.kcal, 1.3),
      tone: finished ? toneFor(kcal, target.kcal) : null,
      hasEntries: day.length > 0,
      cooked: cookedOn.has(date),
    });
  }
  return cells;
}

export function buildMonth({ month, ...inputs }: DayInputs & { month: string }): Month {
  const cells = buildDays({ ...gridBounds(month), month, ...inputs });

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // Finished days of this month with anything eaten; a verdict (tone) means exactly that.
  const logged = cells.filter((cell) => cell.inMonth && cell.tone !== null);
  const count = logged.length;
  return {
    weeks,
    stats: {
      loggedDays: count,
      avgKcal: count ? Math.round(logged.reduce((sum, d) => sum + d.kcal, 0) / count) : 0,
      avgProtein: count ? Math.round(logged.reduce((sum, d) => sum + d.protein, 0) / count) : 0,
      onTargetDays: logged.filter((d) => Math.abs(d.kcal / d.targetKcal - 1) <= 0.1).length,
    },
  };
}
