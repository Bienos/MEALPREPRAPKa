/**
 * "Przelicz resztę dnia": after something unplanned is logged, work out where
 * the day now lands and propose the smallest correction.
 *
 * Deliberately arithmetic, never AI: this is subtraction, and a deterministic
 * answer the user can check beats a generated one.
 */

import { rankSwaps, type Candidate, type DayType, type Frequency, type ReadyPortion } from "./recommend.ts";
import type { Meal } from "./types.ts";

export type Macros = { kcal: number; protein_g: number; fat_g: number; carbs_g: number };

export type DayMeal = Macros & {
  id: string;
  mealKey: string | null;
  mealName: string;
  slot: string;
  status: "planned" | "eaten" | "skipped" | "swapped" | "adhoc";
  portions: number;
};

export type Projection = {
  eaten: Macros;
  planned: Macros;
  /** What the day totals if every remaining planned meal is eaten as-is. */
  projected: Macros;
  /** Projected minus target. Positive means over. */
  delta: Macros;
  /** Target minus eaten, i.e. what is still available today. */
  remaining: Macros;
};

const ZERO: Macros = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };

function add(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: a.protein_g + b.protein_g,
    fat_g: a.fat_g + b.fat_g,
    carbs_g: a.carbs_g + b.carbs_g,
  };
}

function subtract(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal - b.kcal,
    protein_g: a.protein_g - b.protein_g,
    fat_g: a.fat_g - b.fat_g,
    carbs_g: a.carbs_g - b.carbs_g,
  };
}

function round(macros: Macros): Macros {
  return {
    kcal: Math.round(macros.kcal),
    protein_g: Math.round(macros.protein_g),
    fat_g: Math.round(macros.fat_g),
    carbs_g: Math.round(macros.carbs_g),
  };
}

export function projectDay(target: Macros, meals: DayMeal[]): Projection {
  const eaten = meals.filter((meal) => meal.status === "eaten" || meal.status === "adhoc").reduce(add, ZERO);
  const planned = meals.filter((meal) => meal.status === "planned").reduce(add, ZERO);
  const projected = add(eaten, planned);
  return {
    eaten: round(eaten),
    planned: round(planned),
    projected: round(projected),
    delta: round(subtract(projected, target)),
    remaining: round(subtract(target, eaten)),
  };
}

/** Correction foods, used when no swap or portion change is enough on its own. */
export type CorrectionBlock = Macros & { name: string; unit: string; leads: "protein" | "carbs" | "fat" };

export const CORRECTION_BLOCKS: CorrectionBlock[] = [
  { name: "Whey", unit: "25 g", leads: "protein", kcal: 95, protein_g: 20, fat_g: 1.5, carbs_g: 2 },
  { name: "Skyr", unit: "200 g", leads: "protein", kcal: 130, protein_g: 22, fat_g: 0.4, carbs_g: 8 },
  { name: "Ryż", unit: "50 g suchego", leads: "carbs", kcal: 180, protein_g: 3.5, fat_g: 0.5, carbs_g: 39 },
  { name: "Banan", unit: "120 g", leads: "carbs", kcal: 107, protein_g: 1.3, fat_g: 0.4, carbs_g: 25 },
  { name: "Płatki owsiane", unit: "40 g", leads: "carbs", kcal: 150, protein_g: 5, fat_g: 3, carbs_g: 24 },
  { name: "Oliwa", unit: "10 g", leads: "fat", kcal: 90, protein_g: 0, fat_g: 10, carbs_g: 0 },
  { name: "Masło orzechowe", unit: "15 g", leads: "fat", kcal: 95, protein_g: 4, fat_g: 8, carbs_g: 3 },
];

export type Suggestion =
  | {
      kind: "swap";
      meal: DayMeal;
      to: Candidate;
      difference: Macros;
      label: string;
    }
  | {
      kind: "portion";
      meal: DayMeal;
      portions: number;
      difference: Macros;
      label: string;
    }
  | {
      kind: "block";
      block: CorrectionBlock;
      difference: Macros;
      label: string;
    };

const PORTION_STEPS = [0.75, 1, 1.25, 1.5];
/** Below this the day is close enough; proposing a change would be noise. */
const KCAL_TOLERANCE = 80;

/** How badly a projected day misses its target. Lower is better. */
function miss(delta: Macros): number {
  return Math.abs(delta.kcal) + Math.abs(delta.protein_g) * 4 + Math.abs(delta.fat_g) * 2;
}

/**
 * Up to three corrections, smallest first, in the order the spec asks for:
 * swap one future meal, change one future portion, then add a correction block.
 * Meals already eaten are never touched.
 */
export function suggestCorrections({
  target,
  meals,
  library,
  dayType,
  portions = [],
  frequency = {},
  limit = 3,
}: {
  target: Macros;
  meals: DayMeal[];
  library: Meal[];
  dayType: DayType;
  portions?: ReadyPortion[];
  frequency?: Frequency;
  limit?: number;
}): { projection: Projection; suggestions: Suggestion[] } {
  const projection = projectDay(target, meals);
  const future = meals.filter((meal) => meal.status === "planned");

  if (Math.abs(projection.delta.kcal) <= KCAL_TOLERANCE || future.length === 0) {
    return { projection, suggestions: [] };
  }

  const baseline = miss(projection.delta);
  const suggestions: Suggestion[] = [];

  // 1. Swap one future meal for something that closes the gap.
  for (const meal of future) {
    const wanted = {
      kcal: meal.kcal - projection.delta.kcal,
      protein_g: meal.protein_g - projection.delta.protein_g,
    };
    const candidates = rankSwaps({
      meals: library,
      dayType,
      targetKcal: Math.max(wanted.kcal, 0),
      targetProtein: Math.max(wanted.protein_g, 0),
      excludeKeys: meal.mealKey ? [meal.mealKey] : [],
      portions,
      frequency,
      limit: 2,
    });
    for (const candidate of candidates) {
      const difference = round(subtract(candidate, meal));
      const after = miss(add(projection.delta, difference));
      if (after < baseline) {
        suggestions.push({
          kind: "swap",
          meal,
          to: candidate,
          difference,
          label: `${meal.slot}: ${meal.mealName} → ${candidate.mealName}`,
        });
      }
    }
  }

  // 2. Change one future portion.
  for (const meal of future) {
    for (const step of PORTION_STEPS) {
      if (Math.abs(step - meal.portions) < 0.01) continue;
      const ratio = step / meal.portions;
      const difference = round({
        kcal: meal.kcal * ratio - meal.kcal,
        protein_g: meal.protein_g * ratio - meal.protein_g,
        fat_g: meal.fat_g * ratio - meal.fat_g,
        carbs_g: meal.carbs_g * ratio - meal.carbs_g,
      });
      const after = miss(add(projection.delta, difference));
      if (after < baseline) {
        suggestions.push({
          kind: "portion",
          meal,
          portions: step,
          difference,
          label: `${meal.slot}: porcja ${String(step).replace(".", ",")}×`,
        });
      }
    }
  }

  // 3. Add a correction block, which only helps when the day is short.
  for (const block of CORRECTION_BLOCKS) {
    const after = miss(add(projection.delta, block));
    if (after < baseline) {
      suggestions.push({
        kind: "block",
        block,
        difference: round(block),
        label: `+ ${block.name} ${block.unit}`,
      });
    }
  }

  // Best first, and never two suggestions for the same meal.
  const seen = new Set<string>();
  const ranked = suggestions
    .sort((a, b) => miss(add(projection.delta, a.difference)) - miss(add(projection.delta, b.difference)))
    .filter((suggestion) => {
      const key = suggestion.kind === "block" ? `block:${suggestion.block.name}` : `meal:${suggestion.meal.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);

  return { projection, suggestions: ranked };
}

/**
 * "Zostaw kalorie na kolację": shrink future planned meals until roughly
 * `reserve` kcal of the day's target is left unspent. Optionally keep protein
 * intact, which means shrinking the least protein-dense meals first.
 */
export function planDinnerOut({
  target,
  meals,
  reserve,
  preserveProtein = true,
}: {
  target: Macros;
  meals: DayMeal[];
  reserve: number;
  preserveProtein?: boolean;
}): { suggestions: Suggestion[]; freed: number; needed: number } {
  const projection = projectDay(target, meals);
  // Calories that must come out of the remaining plan.
  const needed = Math.round(projection.planned.kcal - (projection.remaining.kcal - reserve));
  if (needed <= 0) return { suggestions: [], freed: 0, needed: 0 };

  const future = meals
    .filter((meal) => meal.status === "planned")
    .slice()
    .sort((a, b) =>
      preserveProtein
        ? // Least protein per kcal first, so protein survives the cut.
          a.protein_g / Math.max(a.kcal, 1) - b.protein_g / Math.max(b.kcal, 1)
        : b.kcal - a.kcal,
    );

  const suggestions: Suggestion[] = [];
  let freed = 0;

  for (const meal of future) {
    if (freed >= needed) break;
    // Smallest cut that helps, largest cut only if needed.
    for (const step of [0.75, 0.5]) {
      const difference = round({
        kcal: meal.kcal * step - meal.kcal,
        protein_g: meal.protein_g * step - meal.protein_g,
        fat_g: meal.fat_g * step - meal.fat_g,
        carbs_g: meal.carbs_g * step - meal.carbs_g,
      });
      if (freed - difference.kcal <= needed || step === 0.5) {
        suggestions.push({
          kind: "portion",
          meal,
          portions: step,
          difference,
          label: `${meal.slot}: porcja ${String(step).replace(".", ",")}×`,
        });
        freed += -difference.kcal;
        break;
      }
    }
  }

  return { suggestions: suggestions.slice(0, 3), freed: Math.round(freed), needed };
}
