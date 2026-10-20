"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";

import {
  deleteShopPrice,
  findShelfPrice,
  findShopPromo,
  saveProductLink,
  upsertShopPrice,
  upsertShopPrices,
} from "@/lib/db/prices";
import { upsertDeliveryQuote } from "@/lib/db/delivery";
import { updateSettings } from "@/lib/db/settings";
import { priceKey } from "@/lib/prices/match";
import {
  refreshAuchanShelf,
  refreshBiedronkaCategoryShelf,
  refreshBlixSweep,
  refreshFriscoPrices,
  refreshShopPromos,
  refreshStokrotkaPrices,
} from "@/lib/prices/refresh";
import { SHOPS } from "@/lib/prices/types";
import { RETAILER_IDS } from "@/lib/grocery/retailers";
import { LOYALTY_PROGRAMS } from "@/lib/grocery/types";
import { fold } from "@/lib/prices/match";

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

export type RefreshFeedsResult =
  | { ok: true; count: number; skipped: boolean; notes: string[] }
  | { ok: false; message: string };

/** The second half of [ Sprawdź promocje ]: Stokrotka's and Frisco's product feeds and the shelves of Auchan's and Biedronka's shops, a request of their own (up to a minute). */
export async function refreshFeedsAction(): Promise<RefreshFeedsResult> {
  try {
    // Two feeds and two shops, side by side. A failing one is logged, the others are still saved.
    const sources = await Promise.allSettled([
      refreshStokrotkaPrices(),
      refreshFriscoPrices(),
      refreshAuchanShelf(),
      refreshBiedronkaCategoryShelf(),
    ]);
    refresh();
    const done = sources.flatMap((one) => (one.status === "fulfilled" ? [one.value] : []));
    const failed = sources.filter((one): one is PromiseRejectedResult => one.status === "rejected");
    if (done.length === 0) throw failed[0].reason;
    for (const one of failed) console.error("[prices] one source failed:", one.reason);
    // Sources left off for want of permission: one line, not one per source.
    const off = done.flatMap((one) => (one.disabled ? [one.disabled] : []));
    return {
      ok: true,
      count: done.reduce((sum, one) => sum + one.count, 0),
      skipped: done.every((one) => one.skipped),
      notes: [
        ...done.flatMap((one) => (one.note ? [one.note] : [])),
        ...(off.length > 1
          ? [`Wyłączone bez potwierdzonej zgody: ${off.length} źródła cen (zob. Źródła danych).`]
          : off),
      ],
    };
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

const quoteSchema = z.object({
  provider: z.string().trim().min(1).max(40),
  fee: z.number().min(0).max(500).nullable(),
  freeAbove: z.number().positive().max(10_000).nullable(),
  minOrder: z.number().positive().max(10_000).nullable(),
  confirmed: z.boolean(),
  note: z.string().trim().max(200),
});

/** The delivery fee I know for a provider: typed from its page (estimate) or seen at checkout (confirmed). */
export async function saveDeliveryQuoteAction(input: z.input<typeof quoteSchema>): Promise<void> {
  await upsertDeliveryQuote(quoteSchema.parse(input));
  refresh();
}

/** The town the shopping comparison is for. A town, never an address. */
export async function setShoppingCityAction(city: string): Promise<void> {
  const value = z.string().trim().min(2).max(60).parse(city);
  await updateSettings({ shopping_city: value });
  updateTag("settings");
  refresh();
}

const preferencesSchema = z.object({
  channel: z.enum(["store", "online", "both"]),
  loyalty: z.array(z.enum(LOYALTY_PROGRAMS)).max(LOYALTY_PROGRAMS.length),
  excludedBrands: z.array(z.string().trim().min(2).max(40)).max(30),
  preferredRetailers: z.array(z.enum(RETAILER_IDS)).max(RETAILER_IDS.length),
});

/**
 * How I shop: shop or online, the loyalty apps I have (app-only prices count
 * only for these), brands never to suggest, the shops shown first.
 */
export async function saveShoppingPreferencesAction(input: z.input<typeof preferencesSchema>): Promise<void> {
  const preferences = preferencesSchema.parse(input);
  await updateSettings({
    shopping_channel: preferences.channel,
    loyalty_programs: [...new Set(preferences.loyalty)],
    excluded_brands: [...new Set(preferences.excludedBrands.map((brand) => fold(brand).trim()))],
    preferred_retailers: [...new Set(preferences.preferredRetailers)],
  });
  updateTag("settings");
  refresh();
}
