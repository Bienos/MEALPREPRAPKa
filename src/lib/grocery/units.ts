/**
 * Quantities and unit prices for grocery packs: grams, millilitres and
 * pieces (the app's units), kilos and litres for showing prices. Pure,
 * client-safe; money in grosz.
 *
 * Grams and millilitres are different things. Treating 1 ml as 1 g is an
 * approximation (close for milk and yogurt, wrong for oil and honey), so any
 * conversion between them says it is approximate. Pieces never convert to
 * weight: "10 jaj" cannot price "600 g of eggs" without a weight per egg.
 */

import type { Unit } from "../meals/ingredients.ts";
import { parsePack } from "../prices/pack.ts";
import { multiplyGrosz, type Grosz } from "./money.ts";

export type Quantity = { amount: number; unit: Unit };

/**
 * A pack size from product text: everything `parsePack` reads ("500 g",
 * "2,5 kg", "4 x 125 g", "1 l", "30 szt.") plus eggs counted by name
 * ("10 jaj", "6 jajek") and bare "x10" counts on egg boxes.
 */
export function parseQuantity(text: string): Quantity | null {
  const eggs = text.match(/\b(\d{1,3})\s*(?:jaj(?:a|ek|ka)?|jajko)\b/i);
  if (eggs) return { amount: Number(eggs[1]), unit: "szt" };
  const pack = parsePack(text);
  if (pack) return { amount: pack.quantity, unit: pack.unit };
  return null;
}

export type Conversion = { amount: number; approximate: boolean };

/** `quantity` in `unit`; null when the two cannot be compared (pieces with weight). */
export function convert(quantity: Quantity, unit: Unit): Conversion | null {
  if (quantity.unit === unit) return { amount: quantity.amount, approximate: false };
  const massOrVolume = (one: Unit) => one === "g" || one === "ml";
  if (massOrVolume(quantity.unit) && massOrVolume(unit)) return { amount: quantity.amount, approximate: true };
  return null;
}

export type PackPurchase = {
  /** Whole packs, or the exact share for goods sold by weight. */
  packs: number;
  /** What those packs hold, in the needed unit. */
  bought: number;
  costGrosz: Grosz;
  approximate: boolean;
};

/**
 * What it takes to cover `needed` with packs of `pack` at `priceGrosz` each.
 * Whole packs are rounded up so the amount is always covered; loose goods
 * cost exactly what is taken. null when the units cannot be compared or a
 * size is not positive.
 */
export function purchaseFor(
  needed: Quantity,
  pack: Quantity,
  priceGrosz: Grosz,
  loose = false,
): PackPurchase | null {
  if (!(needed.amount > 0) || !(pack.amount > 0) || !(priceGrosz > 0)) return null;
  const size = convert(pack, needed.unit);
  if (!size) return null;
  const exact = needed.amount / size.amount;
  const packs = loose ? exact : Math.ceil(exact - 1e-9);
  return {
    packs,
    bought: packs * size.amount,
    costGrosz: multiplyGrosz(priceGrosz, packs),
    approximate: size.approximate,
  };
}

export type UnitPrice = { grosz: Grosz; per: "kg" | "l" | "szt" };

/** Price per kilo, litre or piece of a pack; null for a pack with no size. */
export function unitPrice(priceGrosz: Grosz, pack: Quantity | null): UnitPrice | null {
  if (!pack || !(pack.amount > 0)) return null;
  if (pack.unit === "szt") return { grosz: Math.round(priceGrosz / pack.amount), per: "szt" };
  return { grosz: Math.round((priceGrosz / pack.amount) * 1000), per: pack.unit === "g" ? "kg" : "l" };
}

/** "12,99 zł/kg" */
export function unitPriceLabel(price: UnitPrice): string {
  const zl = (price.grosz / 100).toFixed(2).replace(".", ",");
  return `${zl} zł/${price.per === "szt" ? "szt." : price.per}`;
}
