"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import {
  deleteShopPrice,
  findShelfPrice,
  findShopPromo,
  saveProductLink,
  upsertShopPrice,
  upsertShopPrices,
} from "@/lib/db/prices";
import { priceKey } from "@/lib/prices/match";
import { refreshBlixSweep, refreshShopPromos, refreshStokrotkaPrices } from "@/lib/prices/refresh";
import { SHOPS } from "@/lib/prices/types";

export type RefreshPromosResult = { ok: true; count: number; warnings: string[] } | { ok: false; message: string };

/** [ Sprawdź promocje ] Lidl and the leaflets for my list, then the page re-renders with this week's promos. */
export async function refreshPromosAction(): Promise<RefreshPromosResult> {
  try {
    const result = await refreshShopPromos();
    refresh();
    return { ok: true, ...result };
  } catch (error) {
    console.error("[prices] refresh failed:", error);
    return { ok: false, message: error instanceof Error ? error.message : "Nie udało się sprawdzić promocji." };
  }
}

export type RefreshSweepResult =
  | { ok: true; pagesRead: number; pagesTotal: number; complete: boolean; skipped: boolean }
  | { ok: false; message: string };

/** The second half of [ Sprawdź promocje ]: every grocery offer of every chain from the Blix leaflets (up to a minute). */
export async function refreshSweepAction(): Promise<RefreshSweepResult> {
  try {
    const result = await refreshBlixSweep();
    refresh();
    return { ok: true, ...result };
  } catch (error) {
    console.error("[prices] sweep failed:", error);
    return { ok: false, message: error instanceof Error ? error.message : "Nie udało się pobrać wszystkich gazetek." };
  }
}

export type RefreshFeedsResult = { ok: true; count: number; skipped: boolean } | { ok: false; message: string };

/** The second half of [ Sprawdź promocje ]: Stokrotka's product feed, a request of its own (up to a minute). */
export async function refreshFeedsAction(): Promise<RefreshFeedsResult> {
  try {
    const result = await refreshStokrotkaPrices();
    refresh();
    return { ok: true, ...result };
  } catch (error) {
    console.error("[prices] feed refresh failed:", error);
    return { ok: false, message: error instanceof Error ? error.message : "Nie udało się pobrać cen Stokrotki." };
  }
}

const shopSchema = z.enum(SHOPS);
const itemNameSchema = z.string().trim().min(1).max(200);

const priceSchema = z.object({
  itemName: itemNameSchema,
  shop: shopSchema,
  productLabel: z.string().trim().max(120),
  packQuantity: z.number().positive().max(100_000),
  packUnit: z.enum(["g", "ml", "szt"]),
  price: z.number().positive().max(10_000),
});

/** "Dodaj cenę": my price for an item at a shop. It sticks until I change it. */
export async function saveShopPriceAction(input: z.input<typeof priceSchema>): Promise<void> {
  const price = priceSchema.parse(input);
  await upsertShopPrice({ ...price, itemName: priceKey(price.itemName) });
}

/** "Wpisz ceny": everything typed on the one screen, saved together. */
export async function saveShopPricesAction(inputs: z.input<typeof priceSchema>[]): Promise<void> {
  const prices = z.array(priceSchema).max(500).parse(inputs);
  await upsertShopPrices(prices.map((price) => ({ ...price, itemName: priceKey(price.itemName) })));
}

export async function removeShopPriceAction(itemName: string, shop: string): Promise<void> {
  await deleteShopPrice(priceKey(itemNameSchema.parse(itemName)), shopSchema.parse(shop));
}

const answerPackSchema = z
  .object({
    quantity: z.number().positive().max(100_000),
    unit: z.enum(["g", "ml", "szt"]),
    loose: z.boolean(),
  })
  .nullable();

/**
 * "Pasuje?" tak / nie. The product name is read from the stored promo, not
 * taken from the client. A leaflet offer that does not say what its price is
 * for gets the pack I picked with "tak"; one that does keeps its own.
 */
export async function answerPromoAction(
  itemName: string,
  shop: string,
  productKey: string,
  matches: boolean,
  pack: z.input<typeof answerPackSchema> = null,
): Promise<void> {
  const parsedShop = shopSchema.parse(shop);
  const key = z.string().min(1).max(200).parse(productKey);
  // A leaflet deal or a shelf price from the shop's catalogue: both can be confirmed.
  const promo = (await findShopPromo(parsedShop, key)) ?? (await findShelfPrice(parsedShop, key));
  if (!promo) return; // refreshed away in the meantime; nothing to answer
  const yes = z.boolean().parse(matches);
  const given = yes && promo.packQuantity === null ? answerPackSchema.parse(pack) : null;
  await saveProductLink({
    itemName: priceKey(itemNameSchema.parse(itemName)),
    shop: parsedShop,
    productKey: promo.productKey,
    productName: promo.name,
    matches: yes,
    packQuantity: given?.quantity ?? null,
    packUnit: given?.unit ?? null,
    packLoose: given?.loose ?? false,
  });
}
