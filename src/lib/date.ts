/**
 * Dates for a single user living in one timezone. Kept pure so client
 * components can use these helpers too.
 */

export const APP_TIMEZONE = "Europe/Warsaw";

/** `YYYY-MM-DD` for an instant, in the app's timezone (not the server's). */
export function toIsoDate(date: Date, timeZone: string = APP_TIMEZONE): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape Postgres `date` wants.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayIso(timeZone?: string): string {
  return toIsoDate(new Date(), timeZone);
}

/** Shifts an ISO date by whole days without tripping over DST. */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** "czwartek, 17 września" */
export function longDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** "jutro, piątek 18 września" style label for the tomorrow panel. */
export function shortDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** How far a day is from today, in words: "Jutro", "Wczoraj", "Za 4 dni", "6 dni temu". */
export function relativeDayLabel(isoDate: string, today: string): string {
  const diff = daysBetween(today, isoDate);
  if (diff === 0) return "Dziś";
  if (diff === 1) return "Jutro";
  if (diff === 2) return "Pojutrze";
  if (diff === -1) return "Wczoraj";
  if (diff === -2) return "Przedwczoraj";
  return diff > 0 ? `Za ${diff} dni` : `${-diff} dni temu`;
}
