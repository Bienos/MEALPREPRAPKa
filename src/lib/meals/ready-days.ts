/**
 * Ready days: whole days that hit a DT/DNT target, built from the sheet alone.
 *
 * A day is breakfast + two portions of one meal-prep dish (lunch and dinner,
 * cooked in one batch), or breakfast + one meal prep + a supper, topped up
 * with up to two snacks. Every combination is scored against the day's target
 * and the closest varied ones are offered. Deterministic arithmetic, no AI.
 *
 * Pure and client-safe; the week screen and the server share it.
 */

import { addDays } from "../date.ts";
import { parseBatchMax, parseFridgeDays } from "./prep-plan.ts";
import { kindOfCategory } from "./slots.ts";
import { sumMacros, type DayType, type Macros } from "./today-view-types.ts";
import { variantsForDayType, type Meal, type MealVariant, type Variant } from "./types.ts";

export type ReadyItem = Macros & { mealKey: string; name: string; variant: Variant; slot: string };

export type ReadyDay = {
  /** The dishes it is made of, so the server can rebuild it: "breakfast|main|second|snack,snack". */
  key: string;
  dayType: DayType;
  items: ReadyItem[];
  total: Macros;
  /** Lower is closer to the target. */
  score: number;
  /** Within ±3% of the calories and at least 95% of the protein. */
  fits: boolean;
  mainKey: string;
  breakfastKey: string;
};

const KCAL_TOLERANCE = 0.03;
const PROTEIN_FLOOR = 0.95;
/** Snack combinations further than this from the calorie gap are not worth scoring. */
const SNACK_WINDOW = 0.08;
/** Two portions of one dish beat a dish plus a supper when they score the same: one batch to cook. */
const SUPPER_PENALTY = 0.02;
const SNACK_PENALTY = 0.01;

/** How far a day is from its target. Missing protein costs more than extra; calories count most. */
export function dayScore(total: Macros, target: Macros): number {
  const rel = (value: number, goal: number) => (goal > 0 ? (value - goal) / goal : 0);
  const protein = rel(total.protein_g, target.protein_g);
  return (
    Math.abs(rel(total.kcal, target.kcal)) * 3 +
    (protein < 0 ? -protein * 2 : protein * 0.5) +
    Math.abs(rel(total.fat_g, target.fat_g)) * 0.5 +
    Math.abs(rel(total.carbs_g, target.carbs_g)) * 0.5
  );
}

export function fitsTarget(total: Macros, target: Macros): boolean {
  return (
    Math.abs(total.kcal - target.kcal) <= target.kcal * KCAL_TOLERANCE &&
    total.protein_g >= target.protein_g * PROTEIN_FLOOR
  );
}

type Pool = { breakfasts: MealVariant[]; mains: MealVariant[]; suppers: MealVariant[]; snacks: MealVariant[] };

/** The dishes a day of this type can use, by the meal they are. Emergency meals stay out. */
function poolFor(meals: Meal[], dayType: DayType): Pool {
  const pool: Pool = { breakfasts: [], mains: [], suppers: [], snacks: [] };
  for (const variant of variantsForDayType(meals, dayType)) {
    const kind = kindOfCategory(variant.category);
    if (kind === "sniadanie") pool.breakfasts.push(variant);
    else if (kind === "obiad") pool.mains.push(variant);
    else if (kind === "kolacja") pool.suppers.push(variant);
    else if (kind === "przekaska") pool.snacks.push(variant);
  }
  return pool;
}

type SnackSet = { snacks: MealVariant[]; macros: Macros };

/** No snack, one, or two different ones, sorted by calories for a quick window search. */
function snackSets(snacks: MealVariant[]): SnackSet[] {
  const sets: SnackSet[] = [{ snacks: [], macros: sumMacros([]) }];
  snacks.forEach((first, index) => {
    sets.push({ snacks: [first], macros: sumMacros([first]) });
    for (const second of snacks.slice(index + 1)) sets.push({ snacks: [first, second], macros: sumMacros([first, second]) });
  });
  return sets.sort((a, b) => a.macros.kcal - b.macros.kcal);
}

function item(variant: MealVariant, slot: string): ReadyItem {
  return {
    mealKey: variant.mealKey,
    name: variant.name,
    variant: variant.variant,
    slot,
    kcal: variant.kcal,
    protein_g: variant.protein_g,
    fat_g: variant.fat_g,
    carbs_g: variant.carbs_g,
  };
}

/** A scored combination, kept small: the full ReadyDay is built only for the ones picked. */
type Candidate = { breakfast: MealVariant; main: MealVariant; second: MealVariant; set: SnackSet; score: number; order: number };

/** First index whose calories are at least `kcal` (the list is sorted by calories). */
function lowerBound(kcals: number[], kcal: number): number {
  let low = 0;
  let high = kcals.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (kcals[middle] < kcal) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Every combination for one day type, best first, before picking varied ones.
 * `mainKey` limits it to days built around one meal-prep dish; `batchOnly`
 * to days that eat two portions of it.
 */
function candidates(meals: Meal[], dayType: DayType, target: Macros, mainKey?: string, batchOnly = false): Candidate[] {
  const pool = poolFor(meals, dayType);
  const sets = snackSets(pool.snacks);
  const kcals = sets.map((set) => set.macros.kcal);
  const mains = mainKey ? pool.mains.filter((main) => main.mealKey === mainKey) : pool.mains;
  const window = target.kcal * SNACK_WINDOW;
  const found: Candidate[] = [];

  const consider = (breakfast: MealVariant, main: MealVariant, second: MealVariant, penalty: number) => {
    const kcal = breakfast.kcal + main.kcal + second.kcal;
    const protein = breakfast.protein_g + main.protein_g + second.protein_g;
    const fat = breakfast.fat_g + main.fat_g + second.fat_g;
    const carbs = breakfast.carbs_g + main.carbs_g + second.carbs_g;
    const scoreWith = (set: SnackSet) =>
      dayScore(
        {
          kcal: kcal + set.macros.kcal,
          protein_g: protein + set.macros.protein_g,
          fat_g: fat + set.macros.fat_g,
          carbs_g: carbs + set.macros.carbs_g,
        },
        target,
      ) +
      penalty +
      set.snacks.length * SNACK_PENALTY;

    // sets[0] is "no snack"; the rest are only worth trying near the calorie gap.
    let best = sets[0];
    let bestScore = scoreWith(best);
    const gap = target.kcal - kcal;
    for (let index = Math.max(1, lowerBound(kcals, gap - window)); index < sets.length && kcals[index] <= gap + window; index++) {
      const score = scoreWith(sets[index]);
      if (score < bestScore) {
        best = sets[index];
        bestScore = score;
      }
    }
    found.push({ breakfast, main, second, set: best, score: bestScore, order: found.length });
  };

  for (const breakfast of pool.breakfasts) {
    for (const main of mains) {
      consider(breakfast, main, main, 0);
      if (!batchOnly) for (const supper of pool.suppers) consider(breakfast, main, supper, SUPPER_PENALTY);
    }
  }
  return found.sort((a, b) => a.score - b.score || a.order - b.order);
}

function toReadyDay(candidate: Candidate, dayType: DayType, target: Macros): ReadyDay {
  const { breakfast, main, second, set } = candidate;
  const items = [
    item(breakfast, "Śniadanie"),
    item(main, "Posiłek 2"),
    ...set.snacks.map((snack) => item(snack, "Przekąska")),
    item(second, second === main ? "Posiłek 3" : "Kolacja"),
  ];
  const total = sumMacros(items);
  return {
    key: [breakfast.mealKey, main.mealKey, second.mealKey, set.snacks.map((snack) => snack.mealKey).join(",")].join("|"),
    dayType,
    items,
    total,
    score: candidate.score,
    fits: fitsTarget(total, target),
    mainKey: main.mealKey,
    breakfastKey: breakfast.mealKey,
  };
}

/**
 * The closest ready days for a day type, varied: no two share a breakfast or
 * a meal-prep dish, so the choice is between different days, not the same day
 * with another snack.
 */
export function readyDays(
  meals: Meal[],
  dayType: DayType,
  target: Macros,
  { count = 5, mainKey, batchOnly = false }: { count?: number; mainKey?: string; batchOnly?: boolean } = {},
): ReadyDay[] {
  const picked: ReadyDay[] = [];
  const breakfasts = new Set<string>();
  const mains = new Set<string>();
  for (const candidate of candidates(meals, dayType, target, mainKey, batchOnly)) {
    if (picked.length >= count) break;
    if (breakfasts.has(candidate.breakfast.mealKey) || (!mainKey && mains.has(candidate.main.mealKey))) continue;
    picked.push(toReadyDay(candidate, dayType, target));
    breakfasts.add(candidate.breakfast.mealKey);
    mains.add(candidate.main.mealKey);
  }
  return picked;
}

/** Rebuilds a ready day from its key, for the server to write. null when a dish is gone from the sheet. */
export function readyDayFromKey(meals: Meal[], key: string, dayType: DayType, target: Macros): ReadyDay | null {
  const [breakfastKey, mainKey, secondKey, snackKeys = ""] = key.split("|");
  if (!breakfastKey || !mainKey || !secondKey) return null;
  const pool = poolFor(meals, dayType);
  const breakfast = pool.breakfasts.find((variant) => variant.mealKey === breakfastKey);
  const main = pool.mains.find((variant) => variant.mealKey === mainKey);
  const supper = secondKey === mainKey ? main : pool.suppers.find((variant) => variant.mealKey === secondKey);
  const snacks = snackKeys
    .split(",")
    .filter(Boolean)
    .map((snackKey) => pool.snacks.find((variant) => variant.mealKey === snackKey));
  if (!breakfast || !main || !supper || snacks.some((snack) => !snack)) return null;

  const chosen = snacks as MealVariant[];
  const items = [
    item(breakfast, "Śniadanie"),
    item(main, "Posiłek 2"),
    ...chosen.map((snack) => item(snack, "Przekąska")),
    item(supper, secondKey === mainKey ? "Posiłek 3" : "Kolacja"),
  ];
  const total = sumMacros(items);
  return {
    key,
    dayType,
    items,
    total,
    score: dayScore(total, target),
    fits: fitsTarget(total, target),
    mainKey,
    breakfastKey,
  };
}

/** A main dish cooked once and eaten for `days` days in a row: enough in one batch, and it keeps. */
function batchCovers(main: MealVariant, days: number): boolean {
  const keeps = parseFridgeDays(main.fridgeLife) >= days - 1 || main.freezable === true;
  return keeps && parseBatchMax(main.batch) >= days * 2;
}

/** 1→[1], 4→[2,2], 5→[3,2], 7→[3,2,2]: blocks of at most three days, as even as possible. */
export function batchBlocks(length: number, maxBlock = 3): number[] {
  if (length <= 0) return [];
  const count = Math.ceil(length / maxBlock);
  const base = Math.floor(length / count);
  const extra = length % count;
  return Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0));
}

export type WeekDay = { date: string; dayType: DayType };

/**
 * [ UŁÓŻ TYDZIEŃ ]: a ready day for every given day. Consecutive days share
 * one meal-prep dish in blocks of up to three (one cook, 4–6 portions), each
 * block a different dish, and breakfasts change from one day to the next.
 */
export function planWeek(
  meals: Meal[],
  days: WeekDay[],
  targets: Record<DayType, Macros>,
): { date: string; day: ReadyDay }[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const blocks: WeekDay[][] = [];
  let run: WeekDay[] = [];
  for (const day of sorted) {
    const previous = run[run.length - 1];
    if (previous && addDays(previous.date, 1) !== day.date) {
      blocks.push(...splitRun(run));
      run = [];
    }
    run.push(day);
  }
  blocks.push(...splitRun(run));

  const usedMains = new Set<string>();
  const result: { date: string; day: ReadyDay }[] = [];
  let lastBreakfast: string | null = null;

  for (const block of blocks) {
    const mainKeys = [...new Set(meals.filter((meal) => kindOfCategory(meal.category) === "obiad").map((meal) => meal.key))];
    let best: { mainKey: string; score: number; options: ReadyDay[][] } | null = null;
    for (const mainKey of mainKeys) {
      const meal = meals.find((candidate) => candidate.key === mainKey)!;
      if (!meal.variants.every((variant) => batchCovers(variant, block.length))) continue;
      const options = block.map((day) =>
        readyDays(meals, day.dayType, targets[day.dayType], { count: 3, mainKey, batchOnly: true }),
      );
      if (options.some((list) => list.length === 0)) continue;
      const score = options.reduce((sum, list) => sum + list[0].score, 0) + (usedMains.has(mainKey) ? 1 : 0);
      if (!best || score < best.score) best = { mainKey, score, options };
    }
    if (!best) continue;
    usedMains.add(best.mainKey);
    block.forEach((day, index) => {
      const options = best.options[index];
      const day_ = options.find((option) => option.breakfastKey !== lastBreakfast) ?? options[0];
      lastBreakfast = day_.breakfastKey;
      result.push({ date: day.date, day: day_ });
    });
  }
  return result;
}

function splitRun(run: WeekDay[]): WeekDay[][] {
  const blocks: WeekDay[][] = [];
  let start = 0;
  for (const size of batchBlocks(run.length)) {
    blocks.push(run.slice(start, start + size));
    start += size;
  }
  return blocks;
}


/** "Overnight oats · Chicken Rice ×2 · Whey shake" */
export function readyDayLabel(items: Pick<ReadyItem, "mealKey" | "name">[]): string {
  const parts: { key: string; name: string; count: number }[] = [];
  for (const entry of items) {
    const existing = parts.find((part) => part.key === entry.mealKey);
    if (existing) existing.count += 1;
    else parts.push({ key: entry.mealKey, name: entry.name, count: 1 });
  }
  return parts.map((part) => (part.count > 1 ? `${part.name} ×${part.count}` : part.name)).join(" · ");
}
