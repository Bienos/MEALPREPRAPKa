/**
 * The one place recommendation logic lives. Swap suggestions and no-cook
 * options both rank candidates here, so the rules stay in a single readable
 * module instead of being spread across screens.
 *
 * Scoring is a small weighted sum, lower is better, and every candidate
 * carries the reasons behind its score so the UI can explain itself.
 */

import type { Meal, MealVariant, Variant } from "./types.ts";

export type DayType = "DT" | "DNT";

/** A prepared portion sitting in the fridge or freezer. */
export type ReadyPortion = {
  mealKey: string;
  variant: Variant;
  count: number;
  /** Days until it goes off; null when undated. Sooner is better. */
  daysLeft: number | null;
  location: "fridge" | "freezer";
};

export type Candidate = {
  mealKey: string;
  mealName: string;
  category: string;
  variant: Variant;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  prepTime: string | null;
  /** True when a prepared portion of this meal is waiting. */
  ready: boolean;
  readyLocation: "fridge" | "freezer" | null;
  daysLeft: number | null;
  /** Difference against the meal being replaced, for the "+35 kcal" line. */
  deltaKcal: number;
  deltaProtein: number;
  score: number;
};

/** Weights, kept explicit so the ranking can be read off the page. */
const WEIGHT = {
  /** Eating what is already cooked beats everything else. */
  ready: -1000,
  /** Among ready portions, the one going off soonest wins. */
  expirySoon: -40,
  /** A meal built for the right day type. */
  variantMatch: -300,
  /** Neutral meals are fine on any day, just less targeted. */
  variantNeutral: -80,
  /** One point per kcal of difference. */
  kcal: 1,
  /** Protein matters more per gram than calories do. */
  protein: 4,
  /** A meal eaten often before is a safer suggestion. */
  frequency: -8,
};

/** How often each meal has been eaten, used as a mild preference signal. */
export type Frequency = Record<string, number>;

function readyFor(portions: ReadyPortion[], mealKey: string, variant: Variant): ReadyPortion | undefined {
  const matches = portions.filter((portion) => portion.mealKey === mealKey && portion.count > 0);
  return matches.find((portion) => portion.variant === variant) ?? matches[0];
}

function scoreCandidate({
  variant,
  targetKcal,
  targetProtein,
  dayType,
  ready,
  frequency,
}: {
  variant: MealVariant;
  targetKcal: number;
  targetProtein: number;
  dayType: DayType;
  ready: ReadyPortion | undefined;
  frequency: number;
}): number {
  let score = 0;

  if (ready) {
    score += WEIGHT.ready;
    // 0 days left is the most urgent; cap the bonus so it cannot dominate.
    const urgency = ready.daysLeft === null ? 0 : Math.max(0, 3 - ready.daysLeft);
    score += urgency * WEIGHT.expirySoon;
  }

  if (variant.variant === dayType) score += WEIGHT.variantMatch;
  else if (variant.variant === null) score += WEIGHT.variantNeutral;

  score += Math.abs(variant.kcal - targetKcal) * WEIGHT.kcal;
  score += Math.abs(variant.protein_g - targetProtein) * WEIGHT.protein;
  score += Math.min(frequency, 10) * WEIGHT.frequency;

  return score;
}

function toCandidate(
  meal: Meal,
  variant: MealVariant,
  ready: ReadyPortion | undefined,
  targetKcal: number,
  targetProtein: number,
  score: number,
): Candidate {
  return {
    mealKey: meal.key,
    mealName: meal.name,
    category: meal.category,
    variant: variant.variant,
    kcal: variant.kcal,
    protein_g: variant.protein_g,
    fat_g: variant.fat_g,
    carbs_g: variant.carbs_g,
    prepTime: variant.prepTime,
    ready: Boolean(ready),
    readyLocation: ready?.location ?? null,
    daysLeft: ready?.daysLeft ?? null,
    deltaKcal: Math.round(variant.kcal - targetKcal),
    deltaProtein: Math.round(variant.protein_g - targetProtein),
    score,
  };
}

/**
 * Best swaps for one planned meal. Candidates are variants matching the day
 * type (or neutral), never the meal being replaced, ranked by the weights above.
 */
export function rankSwaps({
  meals,
  dayType,
  targetKcal,
  targetProtein,
  excludeKeys = [],
  portions = [],
  frequency = {},
  limit = 3,
}: {
  meals: Meal[];
  dayType: DayType;
  targetKcal: number;
  targetProtein: number;
  excludeKeys?: string[];
  portions?: ReadyPortion[];
  frequency?: Frequency;
  limit?: number;
}): Candidate[] {
  const skip = new Set(excludeKeys);

  return meals
    .filter((meal) => !skip.has(meal.key))
    .flatMap((meal) =>
      meal.variants
        .filter((variant) => variant.variant === dayType || variant.variant === null)
        .map((variant) => {
          const ready = readyFor(portions, meal.key, variant.variant);
          const score = scoreCandidate({
            variant,
            targetKcal,
            targetProtein,
            dayType,
            ready,
            frequency: frequency[meal.key] ?? 0,
          });
          return toCandidate(meal, variant, ready, targetKcal, targetProtein, score);
        }),
    )
    .sort((a, b) => a.score - b.score || a.mealKey.localeCompare(b.mealKey))
    .slice(0, limit);
}

export type NoCookOption = Candidate & { kind: "ready" | "fastest" | "buy" };

/** "Awaryjne" in the sheet, plus anything explicitly marked as emergency food. */
export function isEmergencyCategory(category: string): boolean {
  const lower = category.toLowerCase();
  return lower.includes("awaryjne") || lower.includes("emergency");
}

/** Minutes from "2 min" / "3–5 min"; large number when unknown, so it sorts last. */
export function prepMinutes(prepTime: string | null): number {
  if (!prepTime) return 999;
  const numbers = prepTime.match(/\d+/g);
  return numbers ? Math.max(...numbers.map(Number)) : 999;
}

/**
 * NIE CHCE MI SIĘ GOTOWAĆ: at most three options, one per kind.
 * READY is whatever is already prepared, FASTEST is the quickest emergency
 * meal, BUY is an emergency meal that needs no cooking at all.
 */
export function noCookOptions({
  meals,
  dayType,
  remainingKcal,
  remainingProtein,
  portions = [],
  frequency = {},
}: {
  meals: Meal[];
  dayType: DayType;
  remainingKcal: number;
  remainingProtein: number;
  portions?: ReadyPortion[];
  frequency?: Frequency;
}): NoCookOption[] {
  const options: NoCookOption[] = [];

  // READY — best prepared portion, ranked by the same weights.
  const readyKeys = new Set(portions.filter((portion) => portion.count > 0).map((portion) => portion.mealKey));
  const readyPick = rankSwaps({
    meals: meals.filter((meal) => readyKeys.has(meal.key)),
    dayType,
    targetKcal: remainingKcal,
    targetProtein: remainingProtein,
    portions,
    frequency,
    limit: 1,
  })[0];
  if (readyPick) options.push({ ...readyPick, kind: "ready" });

  // FASTEST — quickest emergency meal that is not the READY pick.
  const emergency = meals.filter((meal) => isEmergencyCategory(meal.category));
  const fastest = rankSwaps({
    meals: emergency
      .filter((meal) => meal.key !== readyPick?.mealKey)
      .slice()
      .sort(
        (a, b) =>
          prepMinutes(a.variants[0]?.prepTime ?? null) - prepMinutes(b.variants[0]?.prepTime ?? null),
      )
      .slice(0, 6),
    dayType,
    targetKcal: remainingKcal,
    targetProtein: remainingProtein,
    frequency,
    limit: 1,
  })[0];
  if (fastest) options.push({ ...fastest, kind: "fastest" });

  // BUY — another emergency meal, something you can assemble from a shop.
  const used = new Set(options.map((option) => option.mealKey));
  const buy = rankSwaps({
    meals: emergency.filter((meal) => !used.has(meal.key)),
    dayType,
    targetKcal: remainingKcal,
    targetProtein: remainingProtein,
    frequency,
    limit: 1,
  })[0];
  if (buy) options.push({ ...buy, kind: "buy" });

  return options.slice(0, 3);
}
