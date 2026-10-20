/**
 * Where a price came from, in words, so every number on the screen says its
 * source and its day instead of looking guessed. Pure and client-safe.
 */

import { SHOP_LABELS, type ShopPromo } from "./types.ts";

export type PriceSource = {
  /** "Gazetka Biedronka, s. 48", "Sklep online Auchan", "lidl.pl", "Stała cena Lidla (gazetka)" */
  label: string;
  /** "20.10", the day the price was read; null when not known. */
  day: string | null;
  /** Where to see it yourself. */
  url: string;
};

export function priceSource(promo: ShopPromo): PriceSource {
  const shop = SHOP_LABELS[promo.shop];
  const day = promo.fetchedAt ? dayOf(promo.fetchedAt) : null;
  const url = promo.sourceUrl;
  if (promo.productKey.startsWith("lidl-everyday:")) {
    return { label: "Stała cena Lidla (gazetka „Rewolucja cenowa”)", day, url };
  }
  if (promo.productKey.startsWith("blix:")) {
    const page = url.match(/pageNumber=(\d+)/)?.[1];
    return { label: `Gazetka ${shop}${page ? `, s. ${page}` : ""}`, day, url };
  }
  if (promo.productKey.startsWith("lidl:")) return { label: "lidl.pl", day, url };
  if (promo.shelf) return { label: `Sklep online ${shop}`, day, url };
  return { label: shop, day, url };
}

/** "20.10" from an ISO date or timestamp. */
export function dayOf(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}
