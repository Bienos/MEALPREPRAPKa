/**
 * Deterministic meal-prep generator. No AI, no solver: a small set of ordered
 * rules that produce a sensible plan and always the same plan for the same
 * input. Pure functions only, so it is unit-testable and safe on the client.
 */

import type { Meal, MealVariant, Variant } from "./types.ts";

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
): Candidate[] {
  const targetKcal = portionTarget(targets[dayType].kcal);
  const targetProtein = (targets[dayType].protein_g * PREP_SHARE_OF_DAY) / PREP_MEALS_PER_DAY;

  return meals
    .filter((meal) => isMealPrepCategory(meal.category))
    .flatMap((meal) =>
      meal.variants
        .filter((variant) => variant.variant === dayType || variant.variant === null)
        .filter((variant) => parseBatchMax(variant.batch) > 1)
        // The food has to survive the span, unless it can be frozen.
        .filter((variant) => parseFridgeDays(variant.fridgeLife) >= spanDays || variant.freezable === true)
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
  fridge = [],
  mealsPerDay = PREP_MEALS_PER_DAY,
}: {
  days: PrepDay[];
  meals: Meal[];
  targets: Record<DayType, { kcal: number; protein_g: number }>;
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
    DT: candidatesFor(meals, "DT", spanDays, targets),
    DNT: candidatesFor(meals, "DNT", spanDays, targets),
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
  limit = 3,
}: {
  item: PrepItem;
  meals: Meal[];
  targets: Record<DayType, { kcal: number; protein_g: number }>;
  spanDays: number;
  exclude: string[];
  limit?: number;
}): PrepItem[] {
  const dayType: DayType = item.variant ?? "DT";
  const skip = new Set([...exclude, item.mealKey]);
  return candidatesFor(meals, dayType, spanDays, targets)
    .filter((candidate) => !skip.has(candidate.meal.key))
    .slice(0, limit)
    .map((candidate) => toItem(candidate, item.portions));
}
