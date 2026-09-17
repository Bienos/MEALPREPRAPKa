import "server-only";

import { listPantryStaples } from "@/lib/db/pantry";
import {
  addPrepSessionItem,
  createPrepSession,
  deletePrepSessionItem,
  getActivePrepSession,
  listPrepSessionItems,
  replacePrepSessionItems,
  updatePrepSession,
  type NewPrepSessionItem,
  type PrepSession,
  type PrepSessionItem,
} from "@/lib/db/prep-sessions";
import { createPrepBatch, listAvailablePortions } from "@/lib/db/prep";
import { getTargets } from "@/lib/db/settings";
import type { DayType } from "@/lib/db/helpers";
import { replacePrepShoppingItems } from "@/lib/db/shopping";
import { addDays, todayIso } from "@/lib/date";
import { aggregateIngredients } from "./ingredients";
import { getMealLibrary } from "./library";
import {
  availableDishes,
  buildPrepPlan,
  swapAlternatives,
  type PrepItem,
  type PrepSlot,
} from "./prep-plan";

/** Strips the database-generated keys so a row can be re-inserted. */
function toItemRow(item: PrepSessionItem): NewPrepSessionItem {
  return {
    position: item.position,
    meal_key: item.meal_key,
    meal_name: item.meal_name,
    variant: item.variant,
    portions: item.portions,
    kcal: item.kcal,
    protein_g: item.protein_g,
    fat_g: item.fat_g,
    carbs_g: item.carbs_g,
    ingredients: item.ingredients,
    fridge_days: item.fridge_days,
    prep_minutes: item.prep_minutes,
  };
}

/** Item rows as the database wants them. */
function toRows(items: PrepItem[]): NewPrepSessionItem[] {
  return items.map((item, index) => ({
    position: index,
    meal_key: item.mealKey,
    meal_name: item.mealName,
    variant: item.variant,
    portions: item.portions,
    kcal: Math.round(item.kcal),
    protein_g: item.protein_g,
    fat_g: item.fat_g,
    carbs_g: item.carbs_g,
    ingredients: item.ingredients,
    fridge_days: item.fridgeDays,
    prep_minutes: item.prepMinutes,
  }));
}

/** Database rows back into the generator's shape, for swapping and steps. */
export function toPrepItems(items: PrepSessionItem[]): PrepItem[] {
  return items.map((item) => ({
    mealKey: item.meal_key,
    mealName: item.meal_name,
    variant: item.variant,
    portions: item.portions,
    kcal: item.kcal,
    protein_g: item.protein_g,
    fat_g: item.fat_g,
    carbs_g: item.carbs_g,
    ingredients: item.ingredients,
    fridgeDays: item.fridge_days,
    prepMinutes: item.prep_minutes,
  }));
}

/** Available fridge portions, counted per variant, for the generator. */
async function fridgeStock() {
  const portions = await listAvailablePortions();
  const counts = new Map<string, number>();
  for (const portion of portions) {
    const key = portion.batch.variant ?? "null";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([variant, count]) => ({
    variant: variant === "null" ? null : (variant as DayType),
    count,
  }));
}

/**
 * [ BUILD PREP ]: generates the plan for the chosen days, stores it as the
 * active session and regenerates the shopping list.
 */
export async function buildPrep(
  days: { date: string; day_type: DayType }[],
  slot: PrepSlot = "obiad",
): Promise<PrepSession> {
  const [{ library }, targets, fridge] = await Promise.all([getMealLibrary(), getTargets(), fridgeStock()]);

  const plan = buildPrepPlan({
    days: days.map((day) => ({ date: day.date, dayType: day.day_type })),
    meals: library.meals,
    targets,
    slot,
    fridge,
  });

  const session = await createPrepSession(days, slot);
  await replacePrepSessionItems(session.id, toRows(plan.items));
  await regenerateShoppingList(session.id);
  return session;
}

/** [ ZAMIEŃ DANIE ]: at most three alternatives for one dish. */
export async function alternativesFor(sessionId: string, itemId: string): Promise<PrepItem[]> {
  const [{ library }, targets, items] = await Promise.all([
    getMealLibrary(),
    getTargets(),
    listPrepSessionItems(sessionId),
  ]);
  const current = items.find((item) => item.id === itemId);
  if (!current) return [];

  const session = await getActivePrepSession();
  const spanDays = Math.max(session?.days.length ?? 1, 1);

  return swapAlternatives({
    item: toPrepItems([current])[0],
    meals: library.meals,
    targets,
    spanDays,
    slot: session?.slot ?? "obiad",
    exclude: items.map((item) => item.meal_key),
  });
}

/**
 * [ DODAJ DANIE ]: the whole slot to choose from, minus what the prep already
 * has. Uncapped on purpose — this is the screen for picking by hand.
 */
export async function dishesToAdd(sessionId: string): Promise<PrepItem[]> {
  const [{ library }, targets, items, session] = await Promise.all([
    getMealLibrary(),
    getTargets(),
    listPrepSessionItems(sessionId),
    getActivePrepSession(),
  ]);
  if (!session) return [];

  return availableDishes({
    meals: library.meals,
    targets,
    spanDays: Math.max(session.days.length, 1),
    slot: session.slot,
    // Cover the day type the prep needs most, so a hand-picked dish still fits.
    dayType: session.days.some((day) => day.day_type === "DT") ? "DT" : "DNT",
    exclude: items.map((item) => item.meal_key),
  });
}

export async function addDishToPrep(sessionId: string, mealKey: string): Promise<void> {
  const options = await dishesToAdd(sessionId);
  const chosen = options.find((option) => option.mealKey === mealKey);
  if (!chosen) return;

  await addPrepSessionItem(sessionId, toRows([chosen])[0]);
  await regenerateShoppingList(sessionId);
}

export async function removeDishFromPrep(sessionId: string, mealKey: string): Promise<void> {
  const items = await listPrepSessionItems(sessionId);
  // A dish can hold one row per day type, so remove them all together.
  await Promise.all(
    items.filter((item) => item.meal_key === mealKey).map((item) => deletePrepSessionItem(item.id)),
  );
  await regenerateShoppingList(sessionId);
}

/** Swaps every row of one dish for another, keeping portion counts and variants. */
export async function swapDish(sessionId: string, itemId: string, newMealKey: string): Promise<void> {
  const [{ library }, items] = await Promise.all([getMealLibrary(), listPrepSessionItems(sessionId)]);
  const current = items.find((item) => item.id === itemId);
  if (!current) return;

  const replacement = library.meals.find((meal) => meal.key === newMealKey);
  if (!replacement) return;

  const swapped = items.map((item) => {
    if (item.meal_key !== current.meal_key) return item;
    const variant =
      replacement.variants.find((candidate) => candidate.variant === item.variant) ?? replacement.variants[0];
    return {
      ...item,
      meal_key: replacement.key,
      meal_name: replacement.name,
      variant: variant.variant,
      kcal: Math.round(variant.kcal),
      protein_g: variant.protein_g,
      fat_g: variant.fat_g,
      carbs_g: variant.carbs_g,
      ingredients: variant.ingredients,
    };
  });

  await replacePrepSessionItems(sessionId, swapped.map(toItemRow));
  await regenerateShoppingList(sessionId);
}

/**
 * Rebuilds the prep part of the shopping list from the session's items.
 * Staples that are in stock at home are left out.
 */
export async function regenerateShoppingList(sessionId: string): Promise<void> {
  const [items, staples] = await Promise.all([listPrepSessionItems(sessionId), listPantryStaples()]);
  const atHome = new Set(staples.filter((staple) => staple.in_stock).map((staple) => staple.name.toLowerCase()));

  const totals = aggregateIngredients(
    items.map((item) => ({ text: item.ingredients, portions: item.portions })),
  );

  await replacePrepShoppingItems(
    totals
      .filter((item) => !atHome.has(item.name))
      .map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
      })),
  );
}

export type FinishedPortion = { mealName: string; variant: DayType | null; count: number };

/**
 * Finishing the cook turns every planned item into a prep batch and one fridge
 * portion per serving, with an expiry taken from the sheet's fridge life.
 */
export async function finishPrep(sessionId: string): Promise<FinishedPortion[]> {
  const items = await listPrepSessionItems(sessionId);
  const cookedOn = todayIso();
  const created: FinishedPortion[] = [];

  for (const item of items) {
    await createPrepBatch({
      meal_key: item.meal_key,
      meal_name: item.meal_name,
      variant: item.variant,
      cooked_on: cookedOn,
      portions_made: item.portions,
      kcal: item.kcal,
      protein_g: item.protein_g,
      fat_g: item.fat_g,
      carbs_g: item.carbs_g,
      location: "fridge",
      expires_on: item.fridge_days > 0 ? addDays(cookedOn, item.fridge_days) : null,
    });
    created.push({ mealName: item.meal_name, variant: item.variant, count: item.portions });
  }

  await updatePrepSession(sessionId, { status: "done", completed_at: new Date().toISOString() });
  return created;
}
