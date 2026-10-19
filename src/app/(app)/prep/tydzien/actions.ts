"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { weekStart } from "@/lib/meals/calendar";
import { rebuildShoppingList } from "@/lib/meals/prep";
import { applyReadyDay, applyReadyDayToDays, clearDay, fillWeekWithReadyDays } from "@/lib/meals/week";
import { setDayTypeAction } from "../../actions";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dayTypeSchema = z.enum(["DT", "DNT"]);

/** A week is named by its Monday; anything else is not a week this screen made. */
function checkedStart(start: string): string {
  const date = dateSchema.parse(start);
  if (weekStart(date) !== date) throw new Error(`Not a week start: ${start}`);
  return date;
}

/** [ UŁÓŻ TYDZIEŃ ]: ready days on every empty day from today. Returns how many were filled. */
export async function fillWeekAction(start: string): Promise<number> {
  const filled = await fillWeekWithReadyDays(checkedStart(start));
  refresh();
  return filled;
}

/** [ WYBIERZ ] on a ready day: it replaces what was planned that day. */
export async function applyReadyDayAction(date: string, key: string, dayType: string): Promise<boolean> {
  const applied = await applyReadyDay(
    dateSchema.parse(date),
    z.string().min(3).max(400).parse(key),
    dayTypeSchema.parse(dayType),
  );
  refresh();
  return applied;
}

/** [ WYBIERZ NA N DNI ]: the same ready day on up to a week of days. Returns how many were set. */
export async function applyReadyDayToDaysAction(
  days: { date: string; dayType: string }[],
  key: string,
): Promise<number> {
  const parsed = z
    .array(z.object({ date: dateSchema, dayType: dayTypeSchema }))
    .min(1)
    .max(7)
    .parse(days);
  const applied = await applyReadyDayToDays(parsed, z.string().min(3).max(400).parse(key));
  refresh();
  return applied;
}

export async function clearDayAction(date: string): Promise<boolean> {
  const cleared = await clearDay(dateSchema.parse(date));
  refresh();
  return cleared;
}

/** DT/DNT on the week: the day's planned meals switch version, and the list follows. */
export async function setWeekDayTypeAction(date: string, dayType: string): Promise<void> {
  await setDayTypeAction(dateSchema.parse(date), dayTypeSchema.parse(dayType));
  await rebuildShoppingList();
  refresh();
}
