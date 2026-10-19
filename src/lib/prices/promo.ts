/**
 * The normalized promotion every shop adapter returns, checked with Zod before
 * anything is written, and the small text helpers adapters share.
 * Server-side only by use (adapters, data access).
 */

import { z } from "zod";

import type { Unit } from "../meals/ingredients.ts";
import { SHOPS, type ShopPromo } from "./types.ts";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const shopPromoSchema = z
  .object({
    shop: z.enum(SHOPS),
    productKey: z.string().min(1),
    name: z.string().min(1),
    packQuantity: z.number().positive().nullable(),
    packUnit: z.enum(["g", "ml", "szt"]).nullable(),
    loose: z.boolean(),
    promoPrice: z.number().nonnegative(),
    regularPrice: z.number().nonnegative().nullable(),
    validFrom: isoDate,
    validTo: isoDate.nullable(),
    conditions: z.string(),
    appOnly: z.boolean(),
    multibuy: z.string().nullable(),
    multibuyMin: z.number().int().min(1),
    sourceUrl: z.url(),
  })
  .refine((promo) => (promo.packQuantity === null) === (promo.packUnit === null), "Pack size needs both amount and unit")
  .refine((promo) => promo.validTo === null || promo.validTo >= promo.validFrom, "Promo ends before it starts") satisfies z.ZodType<ShopPromo>;

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
