/**
 * Reading a pack size from a product text. Plain code, no Zod, so client
 * components can use it through the matching rules.
 */

import type { Unit } from "../meals/ingredients.ts";

/**
 * "300 g", "2,5 kg", "30 szt.", "4 x 125 g", "Sześciosztuk, 6 x 1,5 L",
 * "500 ml 1 L = 17,98" -> amount in the app's units (g, ml, szt).
 */
export function parsePack(text: string): { quantity: number; unit: Unit } | null {
  const multi = text.match(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)\b/i);
  const single = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|szt)\b/i);
  const [count, amount, unit] = multi
    ? [Number(multi[1]), toNumber(multi[2]), multi[3].toLowerCase()]
    : single
      ? [1, toNumber(single[1]), single[2].toLowerCase()]
      : [0, 0, ""];
  if (!count || !amount) return null;
  const factor = unit === "kg" || unit === "l" ? 1000 : 1;
  const appUnit: Unit = unit === "kg" || unit === "g" ? "g" : unit === "szt" ? "szt" : "ml";
  return { quantity: Math.round(count * amount * factor * 100) / 100, unit: appUnit };
}

function toNumber(value: string): number {
  return Number(value.replace(",", "."));
}
