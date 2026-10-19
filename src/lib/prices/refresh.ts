import "server-only";

import { replaceShopPromos } from "@/lib/db/prices";
import { fetchLidlPromos } from "./lidl";
import type { Shop, ShopPromo } from "./types";

/**
 * Shops whose website promotions can be read with a plain request. Biedronka
 * is not here: its weekly offers are only leaflet images, so it is priced from
 * my own prices.
 */
const ADAPTERS: Partial<Record<Shop, (now: Date) => Promise<ShopPromo[]>>> = {
  lidl: fetchLidlPromos,
};

/**
 * "Sprawdź promocje": one request per shop, only when I tap. A shop's promos
 * are fetched and validated in full before its old rows are replaced, so a
 * failed or changed response leaves last week's data alone.
 */
export async function refreshShopPromos(): Promise<{ shop: Shop; count: number }[]> {
  const now = new Date();
  const results: { shop: Shop; count: number }[] = [];
  for (const [shop, fetchPromos] of Object.entries(ADAPTERS) as [Shop, (now: Date) => Promise<ShopPromo[]>][]) {
    const promos = await fetchPromos(now);
    await replaceShopPromos(shop, promos, now.toISOString());
    console.info(`[prices] ${shop}: ${promos.length} promos`);
    results.push({ shop, count: promos.length });
  }
  return results;
}
