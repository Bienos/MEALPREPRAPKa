import "server-only";
import { z } from "zod";

import { getSupabase } from "@/lib/supabase/server";
import {
  SHOPS,
  type ProductLink,
  type ShelfPrice,
  type Shop,
  type ShopPrice,
  type ShopPromo,
} from "@/lib/prices/types";
import { addDays, toIsoDate } from "@/lib/date";
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

/**
 * A refresh: these shops' old promos from this source go, this week's take
 * their place. A source is its product-key prefix ("lidl:" for lidl.pl,
 * "blix:" for the leaflets), so Lidl's two sources do not erase each other.
 */
export async function replaceShopPromos(
  shops: Shop[],
  promos: ShopPromo[],
  fetchedAt: string,
  keyPrefix: string,
): Promise<void> {
  const db = getSupabase();
  ok(await db.from("shop_promos").delete().in("shop", shops).like("product_key", `${keyPrefix}%`));
  const kept = promos.filter((promo) => shops.includes(promo.shop) && promo.productKey.startsWith(keyPrefix));
  if (kept.length === 0) return;
  ok(
    await db.from("shop_promos").insert(
      kept.map((promo) => ({
        shop: promo.shop,
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
  updated_at: z.string().optional(),
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
    updatedAt: row.updated_at,
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

/** Several prices at once ("Wpisz ceny"): one write, each replacing its item and shop. */
export async function upsertShopPrices(prices: ShopPrice[]): Promise<void> {
  if (prices.length === 0) return;
  ok(
    await getSupabase()
      .from("shop_prices")
      .upsert(
        prices.map((price) => ({
          item_name: price.itemName,
          shop: price.shop,
          product_label: price.productLabel,
          pack_quantity: price.packQuantity,
          pack_unit: price.packUnit,
          price: price.price,
        })),
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
  pack_quantity: z.coerce.number().nullable(),
  pack_unit: packUnitSchema.nullable(),
  pack_loose: z.boolean(),
});

export async function listProductLinks(): Promise<ProductLink[]> {
  const result = await getSupabase()
    .from("shop_product_links")
    .select("item_name, shop, product_key, matches, pack_quantity, pack_unit, pack_loose");
  return rows(linkRowSchema, result).map((row) => ({
    itemName: row.item_name,
    shop: row.shop,
    productKey: row.product_key,
    matches: row.matches,
    packQuantity: row.pack_quantity,
    packUnit: row.pack_unit,
    packLoose: row.pack_loose,
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
        pack_quantity: link.packQuantity,
        pack_unit: link.packUnit,
        pack_loose: link.packLoose,
      },
      { onConflict: "item_name,shop,product_key" },
    ),
  );
}

/* Shelf prices from a shop's own catalogue ----------------------------------- */

/** A shelf price counts this long after it was read; then it is read again. */
export const SHELF_PRICE_DAYS = 30;

const shelfRowSchema = z.object({
  shop: shopSchema,
  product_key: z.string(),
  name: z.string(),
  pack_quantity: z.coerce.number(),
  pack_unit: packUnitSchema,
  loose: z.boolean(),
  price: z.coerce.number(),
  source_url: z.string(),
  fetched_at: z.string(),
});
type ShelfRow = z.infer<typeof shelfRowSchema>;

/** A shelf price in the same shape as a promotion, so matching and the basket treat both alike. */
function shelfToPromo(row: ShelfRow): StoredPromo {
  const fetched = toIsoDate(new Date(row.fetched_at));
  return {
    shop: row.shop,
    productKey: row.product_key,
    name: row.name,
    packQuantity: row.pack_quantity,
    packUnit: row.pack_unit,
    loose: row.loose,
    promoPrice: row.price,
    regularPrice: null,
    validFrom: fetched,
    validTo: addDays(fetched, SHELF_PRICE_DAYS),
    conditions: "Cena z półki w sklepie internetowym; w sklepie może się trochę różnić.",
    appOnly: false,
    multibuy: null,
    multibuyMin: 1,
    sourceUrl: row.source_url,
    shelf: true,
    fetchedAt: row.fetched_at,
  };
}

export async function listShelfPrices(): Promise<StoredPromo[]> {
  const result = await getSupabase().from("shelf_prices").select("*").order("name");
  return rows(shelfRowSchema, result).map(shelfToPromo);
}

export async function findShelfPrice(shop: Shop, productKey: string): Promise<StoredPromo | null> {
  const result = await getSupabase()
    .from("shelf_prices")
    .select("*")
    .eq("shop", shop)
    .eq("product_key", productKey)
    .maybeSingle();
  const row = maybeRow(shelfRowSchema, result);
  return row ? shelfToPromo(row) : null;
}

/** Each price read replaces that product's old one; products not read this time stay. */
export async function upsertShelfPrices(shop: Shop, prices: ShelfPrice[], fetchedAt: string): Promise<void> {
  if (prices.length === 0) return;
  ok(
    await getSupabase()
      .from("shelf_prices")
      .upsert(
        prices.map((price) => ({
          shop,
          product_key: price.productKey,
          name: price.name,
          pack_quantity: price.packQuantity,
          pack_unit: price.packUnit,
          loose: price.loose,
          price: price.price,
          source_url: price.sourceUrl,
          fetched_at: fetchedAt,
        })),
        { onConflict: "shop,product_key" },
      ),
  );
}

/* Leaflet offers added without replacing what is there ------------------------ */

/** Adds these promos, each replacing the same shop's same offer; nothing else is deleted. */
export async function upsertShopPromos(promos: ShopPromo[], fetchedAt: string): Promise<void> {
  const db = getSupabase();
  for (let index = 0; index < promos.length; index += 500) {
    ok(
      await db.from("shop_promos").upsert(
        promos.slice(index, index + 500).map((promo) => ({
          shop: promo.shop,
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
        { onConflict: "shop,product_key" },
      ),
    );
  }
}

/** Promos that ended before today are of no use and go. */
export async function deleteExpiredPromos(today: string): Promise<void> {
  ok(await getSupabase().from("shop_promos").delete().lt("valid_to", today));
}

/* When a slow source last finished ------------------------------------------- */

export async function getRefreshedAt(source: string): Promise<string | null> {
  const result = await getSupabase().from("source_refreshes").select("finished_at").eq("source", source).maybeSingle();
  const row = maybeRow(z.object({ finished_at: z.string() }), result);
  return row?.finished_at ?? null;
}

export async function markRefreshed(source: string, at: string): Promise<void> {
  ok(await getSupabase().from("source_refreshes").upsert({ source, finished_at: at }, { onConflict: "source" }));
}

/** When each source starting with this prefix last finished, by source ("cat:auchan:2365" -> time). */
export async function listRefreshedAt(prefix: string): Promise<Map<string, string>> {
  const result = await getSupabase()
    .from("source_refreshes")
    .select("source,finished_at")
    .like("source", `${prefix}%`)
    .limit(5000);
  return new Map(
    rows(z.object({ source: z.string(), finished_at: z.string() }), result).map((row) => [row.source, row.finished_at]),
  );
}

export async function markManyRefreshed(sources: string[], at: string): Promise<void> {
  if (sources.length === 0) return;
  ok(
    await getSupabase()
      .from("source_refreshes")
      .upsert(
        sources.map((source) => ({ source, finished_at: at })),
        { onConflict: "source" },
      ),
  );
}

const observationSchema = z.object({
  price: z.coerce.number(),
  observed_at: z.string(),
  kind: z.enum(["promo", "shelf"]),
});
export type PriceObservation = z.infer<typeof observationSchema>;

/** Every price seen for this product, newest first (filled by database triggers on each store). */
export async function listPriceHistory(shop: Shop, productKey: string, limit = 50): Promise<PriceObservation[]> {
  const result = await getSupabase()
    .from("price_observations")
    .select("price,observed_at,kind")
    .eq("shop", shop)
    .eq("product_key", productKey)
    .order("observed_at", { ascending: false })
    .limit(limit);
  return rows(observationSchema, result);
}
