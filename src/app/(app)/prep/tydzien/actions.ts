"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { weekStart } from "@/lib/meals/calendar";
import { rebuildShoppingList } from "@/lib/meals/prep";
import { fillWeekWithDefaults, topUpWeek } from "@/lib/meals/week";

/** A week is named by its Monday; anything else is not a week this screen made. */
function checkedStart(start: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || weekStart(start) !== start) throw new Error(`Not a week start: ${start}`);
  return start;
}

/** [ DOPEŁNIJ ]: snacks on the days that fall short, until the week adds up. */
export async function topUpWeekAction(start: string): Promise<number> {
  const added = await topUpWeek(checkedStart(start));
  refresh();
  return added;
}

/** The default DT/DNT day on every empty day of the week, as a starting point. */
export async function fillWeekAction(start: string): Promise<number> {
  const filled = await fillWeekWithDefaults(checkedStart(start));
  refresh();
  return filled;
}

/** [ LISTA ZAKUPÓW ]: one list for everything planned from today, then straight to it. */
export async function weekShoppingListAction(): Promise<void> {
  await rebuildShoppingList();
  redirect("/prep/zakupy");
}
