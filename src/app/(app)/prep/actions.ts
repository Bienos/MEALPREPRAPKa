"use server";

import { refresh } from "next/cache";

import type { DayType } from "@/lib/db/helpers";
import { deletePrepSession, getActivePrepSession, updatePrepSession } from "@/lib/db/prep-sessions";
import { consumePortion, freezePortion } from "@/lib/db/prep";
import { setStapleInStock } from "@/lib/db/pantry";
import { setShoppingItemChecked, setShoppingItemOwned } from "@/lib/db/shopping";
import {
  addDishToPrep,
  alternativesFor,
  buildPrep,
  dishesToAdd,
  finishPrep,
  regenerateShoppingList,
  removeDishFromPrep,
  swapDish,
} from "@/lib/meals/prep";
import type { PrepSlot } from "@/lib/meals/prep-plan";

export type AlternativeView = { mealKey: string; mealName: string; kcal: number; protein_g: number };

/** [ ZBUDUJ PREP ] */
export async function buildPrepAction(
  days: { date: string; day_type: DayType }[],
  slot: PrepSlot = "obiad",
): Promise<void> {
  await buildPrep(days, slot);
  refresh();
}

/** The whole slot to choose from, for adding a dish by hand. */
export async function dishesToAddAction(): Promise<AlternativeView[]> {
  const session = await getActivePrepSession();
  if (!session) return [];
  const options = await dishesToAdd(session.id);
  return options.map((option) => ({
    mealKey: option.mealKey,
    mealName: option.mealName,
    kcal: option.kcal,
    protein_g: option.protein_g,
  }));
}

export async function addDishAction(mealKey: string): Promise<void> {
  const session = await getActivePrepSession();
  if (!session) return;
  await addDishToPrep(session.id, mealKey);
  refresh();
}

export async function removeDishAction(mealKey: string): Promise<void> {
  const session = await getActivePrepSession();
  if (!session) return;
  await removeDishFromPrep(session.id, mealKey);
  refresh();
}

export async function alternativesAction(itemId: string): Promise<AlternativeView[]> {
  const session = await getActivePrepSession();
  if (!session) return [];
  const options = await alternativesFor(session.id, itemId);
  return options.map((option) => ({
    mealKey: option.mealKey,
    mealName: option.mealName,
    kcal: option.kcal,
    protein_g: option.protein_g,
  }));
}

export async function swapDishAction(itemId: string, mealKey: string): Promise<void> {
  const session = await getActivePrepSession();
  if (!session) return;
  await swapDish(session.id, itemId, mealKey);
  refresh();
}

/** [ ZACZNIJ GOTOWANIE ] */
export async function startCookingAction(): Promise<void> {
  const session = await getActivePrepSession();
  if (!session) return;
  await updatePrepSession(session.id, {
    status: "cooking",
    started_at: new Date().toISOString(),
    current_step: 0,
  });
  refresh();
}

/** Remembers where you are, so closing the phone mid-cook loses nothing. */
export async function setCookingStepAction(step: number): Promise<void> {
  const session = await getActivePrepSession();
  if (!session) return;
  await updatePrepSession(session.id, { current_step: step });
}

/** Finishing the cook creates the batches and fridge portions. */
export async function finishPrepAction(): Promise<void> {
  const session = await getActivePrepSession();
  if (!session) return;
  await finishPrep(session.id);
  refresh();
}

export async function discardPrepAction(): Promise<void> {
  const session = await getActivePrepSession();
  if (session) await deletePrepSession(session.id);
  refresh();
}

/* Shopping list -------------------------------------------------------------- */

export async function checkShoppingItemAction(id: string, checked: boolean): Promise<void> {
  await setShoppingItemChecked(id, checked);
}

/** "Mam to w domu" */
export async function ownShoppingItemAction(id: string, owned: boolean): Promise<void> {
  await setShoppingItemOwned(id, owned);
}

/** Marking a staple out of stock puts it back on the list. */
export async function setStapleStockAction(id: string, inStock: boolean): Promise<void> {
  await setStapleInStock(id, inStock);
  const session = await getActivePrepSession();
  if (session) await regenerateShoppingList(session.id);
  refresh();
}

/* Fridge --------------------------------------------------------------------- */

export async function freezePortionAction(id: string): Promise<void> {
  await freezePortion(id);
  refresh();
}

/**
 * Food that went off or got thrown out. The portion leaves the fridge but the
 * batch stays in history, so past days still show what was actually cooked.
 */
export async function discardPortionAction(id: string): Promise<void> {
  await consumePortion(id, "discarded");
  refresh();
}
