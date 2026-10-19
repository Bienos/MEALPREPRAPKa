/**
 * Deterministic meal-prep generator. No AI, no solver: a small set of ordered
 * rules that produce a sensible plan and always the same plan for the same
 * input. Pure functions only, so it is unit-testable and safe on the client.
 */

import { findMealVariant, type Meal, type MealVariant, type Variant } from "./types.ts";

export type DayType = "DT" | "DNT";

export type PrepDay = { date: string; dayType: DayType };

/** Prepared portions already in the fridge, which the plan should use up first. */
export type FridgeStock = { variant: Variant; count: number };

export type PrepItem = {
  mealKey: string;
  mealName: string;
  variant: Variant;
  portions: number;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  ingredients: string;
  fridgeDays: number;
  prepMinutes: number;
};

export type PrepPlan = {
  items: PrepItem[];
  /** Distinct dishes, which is what actually drives cooking effort. */
  dishCount: number;
  estimatedMinutes: number;
  /** Portions already in the fridge that this plan counts on. */
  fromFridge: Record<DayType, number>;
  needed: Record<DayType, number>;
  /** True when the plan could not fully cover demand from the library. */
  short: boolean;
};

/** Meal-prep portions eaten per day. Their sheet plans two per day. */
export const PREP_MEALS_PER_DAY = 2;
/** Share of the daily target those prep meals should cover; the rest is breakfast and extras. */
const PREP_SHARE_OF_DAY = 0.65;
/** More dishes means more cooking, so the generator stops adding new ones here. */
const MAX_DISHES = 3;

/** "4–6" → 6, "4" → 4, "3 słoiki" → 3. Falls back to 1 when unreadable. */
export function parseBatchMax(batch: string | null): number {
  if (!batch) return 1;
  const numbers = batch.match(/\d+/g);
  if (!numbers) return 1;
  return Math.max(...numbers.map(Number));
}

/** "2–3 dni" → 2. Conservative: the lower bound is the safe one. */
export function parseFridgeDays(fridgeLife: string | null): number {
  if (!fridgeLife) return 0;
  const numbers = fridgeLife.match(/\d+/g);
  if (!numbers) return 0;
  return Math.min(...numbers.map(Number));
}

/** "25–30 min" → 30. The upper bound, so the estimate does not undersell. */
export function parsePrepMinutes(prepTime: string | null): number {
  if (!prepTime) return 0;
  const numbers = prepTime.match(/\d+/g);
  if (!numbers) return 0;
  return Math.max(...numbers.map(Number));
}

export function isMealPrepCategory(category: string): boolean {
  return category.toLowerCase().startsWith("meal prep");
}

/**
 * Which meal of the day a prep is for. The sheet's own categories decide what
 * belongs to each, so adding dishes there is all it takes to widen a slot.
 */
export const PREP_SLOTS = ["sniadanie", "obiad", "kolacja"] as const;
export type PrepSlot = (typeof PREP_SLOTS)[number];

export const PREP_SLOT_LABELS: Record<PrepSlot, string> = {
  sniadanie: "Śniadanie",
  obiad: "Obiad",
  kolacja: "Kolacja",
};

/** Lowercase, without Polish diacritics, so "Śniadanie" matches "sniadanie". */
function foldCategory(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[łŁ]/g, "l")
    .toLowerCase()
    .trim();
}

export function matchesSlot(category: string, slot: PrepSlot): boolean {
  const folded = foldCategory(category);
  if (slot === "obiad") return folded.startsWith("meal prep");
  return folded.startsWith(slot);
}

/** Two meal-prep portions a day, but one breakfast and one supper. */
export function mealsPerDayFor(slot: PrepSlot): number {
  return slot === "obiad" ? PREP_MEALS_PER_DAY : 1;
}

/**
 * Whether a cooked batch lasts the whole prep. Cooked on the first day, the
 * last portion is eaten `spanDays - 1` days later, which is also the expiry
 * finishing a prep writes. Food that freezes always lasts.
 */
function keepsFor(variant: MealVariant, spanDays: number): boolean {
  return parseFridgeDays(variant.fridgeLife) >= spanDays - 1 || variant.freezable === true;
}

/**
 * The longest prep this slot's dishes allow, from the sheet's fridge life.
 * Suppers keep a day or two, so a supper prep longer than that would come
 * back empty. Infinity when something freezes, 0 when nothing batch-cooks.
 */
export function maxPrepDays(meals: Meal[], slot: PrepSlot): number {
  let longest = 0;
  for (const meal of meals) {
    if (!matchesSlot(meal.category, slot)) continue;
    for (const variant of meal.variants) {
      if (parseBatchMax(variant.batch) <= 1) continue;
      const days = variant.freezable === true ? Infinity : parseFridgeDays(variant.fridgeLife) + 1;
      longest = Math.max(longest, days);
    }
  }
  return longest;
}

/** Target kcal for one prepped portion on a given day type. */
export function portionTarget(dayTargetKcal: number): number {
  return (dayTargetKcal * PREP_SHARE_OF_DAY) / PREP_MEALS_PER_DAY;
}

/**
 * How well a variant fits one prepped portion. Lower is better.
 * kcal dominates; protein breaks ties, since hitting protein matters most here.
 */
export function fitScore(variant: MealVariant, targetKcal: number, targetProtein: number): number {
  return Math.abs(variant.kcal - targetKcal) + Math.abs(variant.protein_g - targetProtein) * 4;
}

type Candidate = { meal: Meal; variant: MealVariant; score: number };

function candidatesFor(
  meals: Meal[],
  dayType: DayType,
  spanDays: number,
  targets: Record<DayType, { kcal: number; protein_g: number }>,
  slot: PrepSlot,
): Candidate[] {
  const targetKcal = portionTarget(targets[dayType].kcal);
  const targetProtein = (targets[dayType].protein_g * PREP_SHARE_OF_DAY) / PREP_MEALS_PER_DAY;

  return meals
    .filter((meal) => matchesSlot(meal.category, slot))
    .flatMap((meal) =>
      meal.variants
        .filter((variant) => variant.variant === dayType || variant.variant === null)
        .filter((variant) => parseBatchMax(variant.batch) > 1)
        // The food has to survive the span, unless it can be frozen.
        .filter((variant) => keepsFor(variant, spanDays))
        .map((variant) => ({ meal, variant, score: fitScore(variant, targetKcal, targetProtein) })),
    )
    .sort((a, b) => a.score - b.score || a.meal.key.localeCompare(b.meal.key));
}

function toItem(candidate: Candidate, portions: number): PrepItem {
  const { meal, variant } = candidate;
  return {
    mealKey: meal.key,
    mealName: meal.name,
    variant: variant.variant,
    portions,
    kcal: variant.kcal,
    protein_g: variant.protein_g,
    fat_g: variant.fat_g,
    carbs_g: variant.carbs_g,
    ingredients: variant.ingredients,
    fridgeDays: parseFridgeDays(variant.fridgeLife),
    prepMinutes: parsePrepMinutes(variant.prepTime),
  };
}

/**
 * Builds the plan by applying the rules in priority order:
 * fridge stock first, then the fewest dishes that cover what is left, reusing
 * the same dish across DT and DNT so the shopping list stays short.
 */
export function buildPrepPlan({
  days,
  meals,
  targets,
  slot = "obiad",
  fridge = [],
  mealsPerDay = PREP_MEALS_PER_DAY,
}: {
  days: PrepDay[];
  meals: Meal[];
  targets: Record<DayType, { kcal: number; protein_g: number }>;
  slot?: PrepSlot;
  fridge?: FridgeStock[];
  mealsPerDay?: number;
}): PrepPlan {
  const demand: Record<DayType, number> = { DT: 0, DNT: 0 };
  for (const day of days) demand[day.dayType] += mealsPerDay;

  // Rule 1: what is already in the fridge counts towards the demand.
  const fromFridge: Record<DayType, number> = { DT: 0, DNT: 0 };
  for (const dayType of ["DT", "DNT"] as DayType[]) {
    const matching = fridge
      .filter((stock) => stock.variant === dayType || stock.variant === null)
      .reduce((total, stock) => total + stock.count, 0);
    fromFridge[dayType] = Math.min(matching, demand[dayType]);
  }

  const remaining: Record<DayType, number> = {
    DT: demand.DT - fromFridge.DT,
    DNT: demand.DNT - fromFridge.DNT,
  };

  const spanDays = Math.max(days.length, 1);
  const pools: Record<DayType, Candidate[]> = {
    DT: candidatesFor(meals, "DT", spanDays, targets, slot),
    DNT: candidatesFor(meals, "DNT", spanDays, targets, slot),
  };

  const items: PrepItem[] = [];
  const usedDishes = new Set<string>();

  while (remaining.DT > 0 || remaining.DNT > 0) {
    // Serve the bigger gap first so one dish covers as much as possible.
    const dayType: DayType = remaining.DT >= remaining.DNT ? "DT" : "DNT";
    const pool = pools[dayType];

    const atDishLimit = usedDishes.size >= MAX_DISHES;
    const candidate =
      (atDishLimit ? pool.find((entry) => usedDishes.has(entry.meal.key)) : undefined) ??
      pool.find((entry) => !usedDishes.has(entry.meal.key)) ??
      pool.find((entry) => usedDishes.has(entry.meal.key));

    if (!candidate) break; // library cannot cover this day type

    const batchMax = parseBatchMax(candidate.variant.batch);
    usedDishes.add(candidate.meal.key);

    // Rule: reuse one dish across both day types before reaching for another.
    const take = Math.min(remaining[dayType], batchMax);
    items.push(toItem(candidate, take));
    remaining[dayType] -= take;

    const other: DayType = dayType === "DT" ? "DNT" : "DT";
    if (remaining[other] > 0) {
      const sibling = pools[other].find((entry) => entry.meal.key === candidate.meal.key);
      if (sibling) {
        const siblingTake = Math.min(remaining[other], parseBatchMax(sibling.variant.batch));
        items.push(toItem(sibling, siblingTake));
        remaining[other] -= siblingTake;
      }
    }
  }

  const dishes = new Set(items.map((item) => item.mealKey));
  const estimatedMinutes = [...dishes].reduce((total, key) => {
    const item = items.find((entry) => entry.mealKey === key);
    return total + (item?.prepMinutes ?? 0);
  }, 0);

  return {
    items,
    dishCount: dishes.size,
    estimatedMinutes,
    fromFridge,
    needed: demand,
    short: remaining.DT > 0 || remaining.DNT > 0,
  };
}

/** Up to three alternatives for one dish, best macro fit first. */
export function swapAlternatives({
  item,
  meals,
  targets,
  spanDays,
  exclude,
  slot = "obiad",
  limit = 3,
}: {
  item: PrepItem;
  meals: Meal[];
  targets: Record<DayType, { kcal: number; protein_g: number }>;
  spanDays: number;
  exclude: string[];
  slot?: PrepSlot;
  limit?: number;
}): PrepItem[] {
  const dayType: DayType = item.variant ?? "DT";
  const skip = new Set([...exclude, item.mealKey]);
  return candidatesFor(meals, dayType, spanDays, targets, slot)
    .filter((candidate) => !skip.has(candidate.meal.key))
    .slice(0, limit)
    .map((candidate) => toItem(candidate, item.portions));
}

/**
 * Every dish in the library that can be batch-cooked for this slot, best macro
 * fit first. Unlike `swapAlternatives` this is not capped: it backs the screen
 * where the whole library is browsed and dishes are chosen by hand.
 */
export function availableDishes({
  meals,
  targets,
  spanDays,
  slot,
  dayType = "DT",
  exclude = [],
}: {
  meals: Meal[];
  targets: Record<DayType, { kcal: number; protein_g: number }>;
  spanDays: number;
  slot: PrepSlot;
  dayType?: DayType;
  exclude?: string[];
}): PrepItem[] {
  const skip = new Set(exclude);
  const seen = new Set<string>();
  const items: PrepItem[] = [];

  for (const candidate of candidatesFor(meals, dayType, spanDays, targets, slot)) {
    if (skip.has(candidate.meal.key) || seen.has(candidate.meal.key)) continue;
    seen.add(candidate.meal.key);
    // One batch of the dish, as the sheet's own batch size defines it.
    items.push(toItem(candidate, parseBatchMax(candidate.variant.batch)));
  }

  return items;
}

/** One planned entry on the days being prepped. */
export type PlannedPortion = { mealKey: string; variant: Variant; portions: number };

/**
 * When the days being prepped already have this slot's dishes on them (picked
 * on the week screen), the prep cooks exactly those instead of suggesting
 * others, so it matches what was bought. Portions waiting in the fridge are
 * taken off first. Dishes gone from the sheet are skipped.
 */
export function prepFromPlanned({
  planned,
  meals,
  fridge = {},
}: {
  planned: PlannedPortion[];
  meals: Meal[];
  /** Available portions per meal key. */
  fridge?: Record<string, number>;
}): PrepItem[] {
  const totals = new Map<string, { mealKey: string; variant: Variant; portions: number }>();
  for (const entry of planned) {
    const key = `${entry.mealKey}|${entry.variant ?? ""}`;
    const total = totals.get(key) ?? { mealKey: entry.mealKey, variant: entry.variant, portions: 0 };
    total.portions += entry.portions;
    totals.set(key, total);
  }

  const inFridge = { ...fridge };
  const items: PrepItem[] = [];
  for (const total of totals.values()) {
    const meal = meals.find((candidate) => candidate.key === total.mealKey);
    const variant = findMealVariant(meals, total.mealKey, total.variant);
    if (!meal || !variant) continue;

    const ready = Math.min(inFridge[total.mealKey] ?? 0, Math.floor(total.portions));
    inFridge[total.mealKey] = (inFridge[total.mealKey] ?? 0) - ready;
    // A 1.25× portion still means cooking a whole one.
    const portions = Math.ceil(total.portions - ready - 1e-9);
    if (portions > 0) items.push(toItem({ meal, variant, score: 0 }, portions));
  }
  return items;
}
