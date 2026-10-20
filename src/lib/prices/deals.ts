/**
 * "Promocje tygodnia": the leaflet and app deals of every shop, filtered and
 * ordered for one screen. Pure, so the page stays a thin layer over it.
 */

import { fold } from "./match.ts";
import { SHOPS, type Shop, type ShopPromo } from "./types.ts";

/** The loyalty app that unlocks some of a shop's deals. */
export const APP_LABEL: Partial<Record<Shop, string>> = {
  lidl: "Lidl Plus",
  biedronka: "Moja Biedronka",
  zabka: "Żappka",
  kaufland: "Kaufland Card",
  carrefour: "Mój Carrefour",
  auchan: "Skarbonka",
  stokrotka: "Stokrotka",
  netto: "Netto",
  dino: "Dino",
  aldi: "Aldi",
  leclerc: "Leclerc",
};

export type DealWhen = "now" | "soon";

export type DealQuery = {
  today: string;
  /** All shops when null. */
  shop: Shop | null;
  /** Words from the search box; every one must be in the name. */
  search: string;
  /** Only the deals that could be an item on the shopping list. */
  mineOnly: boolean;
  when: DealWhen;
};

/** The discount in percent against the regular price, when the shop gave one. */
export function discountPercent(promo: Pick<ShopPromo, "promoPrice" | "regularPrice">): number | null {
  if (promo.regularPrice === null || promo.regularPrice <= promo.promoPrice) return null;
  return Math.round((1 - promo.promoPrice / promo.regularPrice) * 100);
}

/** "12,99 zł/kg" for a pack in grams or millilitres, "1,20 zł/szt." for pieces; null when the pack is not known. */
export function unitPriceLabel(
  promo: Pick<ShopPromo, "promoPrice" | "packQuantity" | "packUnit" | "loose">,
): string | null {
  if (promo.loose) return `${money(promo.promoPrice)}/kg`;
  if (!promo.packQuantity || !promo.packUnit) return null;
  if (promo.packUnit === "szt")
    return promo.packQuantity > 1 ? `${money(promo.promoPrice / promo.packQuantity)}/szt.` : null;
  const per = (promo.promoPrice / promo.packQuantity) * 1000;
  return `${money(per)}/${promo.packUnit === "g" ? "kg" : "l"}`;
}

export function money(value: number): string {
  return `${value.toFixed(2).replace(".", ",")} zł`;
}

/** "25.10" from "2026-10-25". */
export function dayLabel(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

/**
 * The deals to show: valid now or starting later, for one shop or all, those
 * naming every search word, those on my list first when asked. Best discount
 * first, then the cheapest per kilo.
 */
export function selectDeals(promos: ShopPromo[], query: DealQuery, mine: Set<string>): ShopPromo[] {
  const words = fold(query.search).split(/\s+/).filter(Boolean);
  const id = (promo: ShopPromo) => `${promo.shop}|${promo.productKey}`;
  return promos
    .filter((promo) => (promo.validTo === null || promo.validTo >= query.today) && !promo.shelf)
    .filter((promo) => (query.when === "now" ? promo.validFrom <= query.today : promo.validFrom > query.today))
    .filter((promo) => query.shop === null || promo.shop === query.shop)
    .filter((promo) => !query.mineOnly || mine.has(id(promo)))
    .filter((promo) => words.every((word) => fold(promo.name).includes(word)))
    .sort(
      (a, b) =>
        Number(mine.has(id(b))) - Number(mine.has(id(a))) ||
        (discountPercent(b) ?? -1) - (discountPercent(a) ?? -1) ||
        a.promoPrice - b.promoPrice,
    );
}

/** How many deals each shop has under this query, so the shop chips can show it. */
export function countByShop(promos: ShopPromo[], query: DealQuery, mine: Set<string>): Record<Shop, number> {
  const counts = Object.fromEntries(SHOPS.map((shop) => [shop, 0])) as Record<Shop, number>;
  for (const promo of selectDeals(promos, { ...query, shop: null }, mine)) counts[promo.shop]++;
  return counts;
}
