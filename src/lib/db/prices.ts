import "server-only";
import { z } from "zod";

import { getSupabase } from "@/lib/supabase/server";
import { SHOPS, type ProductLink, type Shop, type ShopPrice, type ShopPromo } from "@/lib/prices/types";
import { isoDateSchema, maybeRow, ok, rows } from "./helpers";

const shopSchema = z.enum(SHOPS);
const packUnitSchema = z.enum(["g", "ml", "szt"]);

const promoRowSchema = z.object({
  shop: shopSchema,
  product_key: z.string(),
  name: z.string(),
  pack_quantity: z.coerce.number().nullable(),
  pack_unit: packUnitSchema.nullable(),
  loose: z.boolean(),
  promo_price: z.coerce.number(),
  regular_price: z.coerce.number().nullable(),
  valid_from: isoDateSchema,
  valid_to: isoDateSchema.nullable(),
  conditions: z.string(),
  app_only: z.boolean(),
  multibuy: z.string().nullable(),
  multibuy_min: z.number().int(),
  source_url: z.string(),
  fetched_at: z.string(),
});
type PromoRow = z.infer<typeof promoRowSchema>;

export type StoredPromo = ShopPromo & { fetchedAt: string };

function toPromo(row: PromoRow): StoredPromo {
  return {
    shop: row.shop,
    productKey: row.product_key,
    name: row.name,
    packQuantity: row.pack_quantity,
    packUnit: row.pack_unit,
    loose: row.loose,
    promoPrice: row.promo_price,
    regularPrice: row.regular_price,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    conditions: row.conditions,
    appOnly: row.app_only,
    multibuy: row.multibuy,
    multibuyMin: row.multibuy_min,
    sourceUrl: row.source_url,
    fetchedAt: row.fetched_at,
  };
}

/** Every stored promo; a shop's rows are replaced as a whole on refresh. */
export async function listShopPromos(): Promise<StoredPromo[]> {
  const result = await getSupabase().from("shop_promos").select("*").order("name");
  return rows(promoRowSchema, result).map(toPromo);
}

export async function findShopPromo(shop: Shop, productKey: string): Promise<StoredPromo | null> {
  const result = await getSupabase()
    .from("shop_promos")
    .select("*")
    .eq("shop", shop)
    .eq("product_key", productKey)
    .maybeSingle();
  const row = maybeRow(promoRowSchema, result);
  return row ? toPromo(row) : null;
}

/** A refresh: the shop's old promos go, this week's take their place. */
export async function replaceShopPromos(shop: Shop, promos: ShopPromo[], fetchedAt: string): Promise<void> {
  const db = getSupabase();
  ok(await db.from("shop_promos").delete().eq("shop", shop));
  if (promos.length === 0) return;
  ok(
    await db.from("shop_promos").insert(
      promos.map((promo) => ({
        shop,
        product_key: promo.productKey,
        name: promo.name,
        pack_quantity: promo.packQuantity,
        pack_unit: promo.packUnit,
        loose: promo.loose,
        promo_price: promo.promoPrice,
        regular_price: promo.regularPrice,
        valid_from: promo.validFrom,
        valid_to: promo.validTo,
        conditions: promo.conditions,
        app_only: promo.appOnly,
        multibuy: promo.multibuy,
        multibuy_min: promo.multibuyMin,
        source_url: promo.sourceUrl,
        fetched_at: fetchedAt,
      })),
    ),
  );
}

/* My prices ------------------------------------------------------------------ */

const priceRowSchema = z.object({
  item_name: z.string(),
  shop: shopSchema,
  product_label: z.string(),
  pack_quantity: z.coerce.number(),
  pack_unit: packUnitSchema,
  price: z.coerce.number(),
});

export async function listShopPrices(): Promise<ShopPrice[]> {
  const result = await getSupabase().from("shop_prices").select("*").order("item_name");
  return rows(priceRowSchema, result).map((row) => ({
    itemName: row.item_name,
    shop: row.shop,
    productLabel: row.product_label,
    packQuantity: row.pack_quantity,
    packUnit: row.pack_unit,
    price: row.price,
  }));
}

/** One price per item and shop; typing a new one replaces the old. */
export async function upsertShopPrice(price: ShopPrice): Promise<void> {
  ok(
    await getSupabase().from("shop_prices").upsert(
      {
        item_name: price.itemName,
        shop: price.shop,
        product_label: price.productLabel,
        pack_quantity: price.packQuantity,
        pack_unit: price.packUnit,
        price: price.price,
      },
      { onConflict: "item_name,shop" },
    ),
  );
}

export async function deleteShopPrice(itemName: string, shop: Shop): Promise<void> {
  ok(await getSupabase().from("shop_prices").delete().eq("item_name", itemName).eq("shop", shop));
}

/* "Pasuje?" answers ---------------------------------------------------------- */

const linkRowSchema = z.object({
  item_name: z.string(),
  shop: shopSchema,
  product_key: z.string(),
  matches: z.boolean(),
});

export async function listProductLinks(): Promise<ProductLink[]> {
  const result = await getSupabase().from("shop_product_links").select("item_name, shop, product_key, matches");
  return rows(linkRowSchema, result).map((row) => ({
    itemName: row.item_name,
    shop: row.shop,
    productKey: row.product_key,
    matches: row.matches,
  }));
}

export async function saveProductLink(link: ProductLink & { productName: string }): Promise<void> {
  ok(
    await getSupabase().from("shop_product_links").upsert(
      {
        item_name: link.itemName,
        shop: link.shop,
        product_key: link.productKey,
        product_name: link.productName,
        matches: link.matches,
      },
      { onConflict: "item_name,shop,product_key" },
    ),
  );
}
