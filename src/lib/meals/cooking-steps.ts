/**
 * Turns a prep plan into a short kitchen workflow. The point is to cook by
 * component rather than by recipe: all the rice at once, all the chicken at
 * once, then finish each dish. Deterministic and pure.
 */

import { aggregateIngredients, formatAmount, type ShoppingCategory } from "./ingredients.ts";
import type { PrepItem } from "./prep-plan.ts";

export type CookingStep = {
  /** Short instruction, large on screen. */
  title: string;
  /** Optional supporting line: amounts, which dishes it covers. */
  detail?: string;
};

/** Components worth batching across dishes, in the order you would cook them. */
const BATCHED: { category: ShoppingCategory; verb: string }[] = [
  { category: "carbs", verb: "Ugotuj" },
  { category: "meat", verb: "Przygotuj" },
];

/** Ingredients too small or too incidental to deserve their own step. */
const MIN_BATCH_GRAMS = 150;

export function buildCookingSteps(items: PrepItem[]): CookingStep[] {
  if (items.length === 0) return [];

  const steps: CookingStep[] = [];
  const totals = aggregateIngredients(items.map((item) => ({ text: item.ingredients, portions: item.portions })));
  const dishes = [...new Map(items.map((item) => [item.mealKey, item.mealName])).entries()];
  const totalPortions = items.reduce((sum, item) => sum + item.portions, 0);

  steps.push({
    title: "Wyjmij i odmierz składniki",
    detail: dishes.map(([, name]) => name).join(" · "),
  });

  for (const { category, verb } of BATCHED) {
    const group = totals.filter(
      (item) => item.category === category && (item.quantity ?? 0) >= MIN_BATCH_GRAMS,
    );
    for (const item of group) {
      steps.push({
        title: `${verb}: ${item.name}`,
        detail: formatAmount(item.quantity, item.unit) ?? undefined,
      });
    }
  }

  // One finishing step per dish; with a single dish this is just "assemble".
  for (const [key, name] of dishes) {
    const portions = items.filter((item) => item.mealKey === key).reduce((sum, item) => sum + item.portions, 0);
    steps.push({ title: `Dokończ: ${name}`, detail: `${portions} porcji` });
  }

  steps.push({ title: "Rozłóż do pojemników", detail: `${totalPortions} porcji` });

  const variants = new Set(items.map((item) => item.variant).filter(Boolean));
  if (variants.size > 1) {
    steps.push({
      title: "Oznacz pojemniki DT / DNT",
      detail: items
        .filter((item) => item.variant)
        .map((item) => `${item.portions} × ${item.mealName} ${item.variant}`)
        .join(" · "),
    });
  }

  return steps;
}
