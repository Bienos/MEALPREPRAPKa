/**
 * The normalized promotion every shop adapter returns, checked with Zod before
 * anything is written. Server-side only by use (adapters, data access).
 */

import { z } from "zod";

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
