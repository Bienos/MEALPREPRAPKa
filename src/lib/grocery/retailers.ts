/**
 * Polish grocery chains the app knows about. A definition says who the
 * retailer is, never that we have its prices: price data comes only from a
 * provider in `providers.ts`, and most of these have none. Pure, client-safe.
 *
 * Online shops are listed only where this project has read the shop itself
 * (`prices/*.ts`); for the rest the online channel is unknown, not absent.
 */

import { fold } from "../prices/match.ts";
import type { Shop } from "../prices/types.ts";

export const RETAILER_IDS = [
  "biedronka",
  "lidl",
  "kaufland",
  "auchan",
  "carrefour",
  "dino",
  "aldi",
  "netto",
  "zabka",
  "frisco",
  "stokrotka",
  "intermarche",
  "leclerc",
  "spar",
  "selgros",
  "makro",
] as const;
export type RetailerId = (typeof RETAILER_IDS)[number];

export type Retailer = {
  id: RetailerId;
  /** As Polish shoppers write it. */
  name: string;
  website: string;
  /** Physical shops. Frisco is online only. */
  stores: boolean;
  /** Its own online grocery shop, when this project has read it; null when not checked. */
  online: string | null;
  /** Cash & carry: shopping usually needs a customer card. */
  wholesale: boolean;
  /** The id the existing price screens use for it, when they know the chain. */
  shop: Shop | null;
  /** Names OpenStreetMap (and so Open Prices) gives its shops, folded. */
  osmBrands: string[];
};

export const RETAILERS: Retailer[] = [
  { id: "biedronka", name: "Biedronka", website: "https://www.biedronka.pl/", stores: true, online: "https://zakupy.biedronka.pl/", wholesale: false, shop: "biedronka", osmBrands: ["biedronka"] },
  { id: "lidl", name: "Lidl", website: "https://www.lidl.pl/", stores: true, online: null, wholesale: false, shop: "lidl", osmBrands: ["lidl"] },
  { id: "kaufland", name: "Kaufland", website: "https://www.kaufland.pl/", stores: true, online: null, wholesale: false, shop: "kaufland", osmBrands: ["kaufland"] },
  { id: "auchan", name: "Auchan", website: "https://www.auchan.pl/", stores: true, online: "https://zakupy.auchan.pl/", wholesale: false, shop: "auchan", osmBrands: ["auchan", "moje auchan"] },
  { id: "carrefour", name: "Carrefour", website: "https://www.carrefour.pl/", stores: true, online: null, wholesale: false, shop: "carrefour", osmBrands: ["carrefour", "carrefour market", "carrefour express"] },
  { id: "dino", name: "Dino", website: "https://marketdino.pl/", stores: true, online: null, wholesale: false, shop: "dino", osmBrands: ["dino"] },
  { id: "aldi", name: "Aldi", website: "https://www.aldi.pl/", stores: true, online: null, wholesale: false, shop: "aldi", osmBrands: ["aldi"] },
  { id: "netto", name: "Netto", website: "https://netto.pl/", stores: true, online: null, wholesale: false, shop: "netto", osmBrands: ["netto"] },
  { id: "zabka", name: "Żabka", website: "https://www.zabka.pl/", stores: true, online: null, wholesale: false, shop: "zabka", osmBrands: ["zabka"] },
  { id: "frisco", name: "Frisco", website: "https://www.frisco.pl/", stores: false, online: "https://www.frisco.pl/", wholesale: false, shop: "frisco", osmBrands: [] },
  { id: "stokrotka", name: "Stokrotka", website: "https://stokrotka.pl/", stores: true, online: "https://sklep.stokrotka.pl/", wholesale: false, shop: "stokrotka", osmBrands: ["stokrotka", "stokrotka market", "stokrotka express"] },
  { id: "intermarche", name: "Intermarché", website: "https://intermarche.pl/", stores: true, online: null, wholesale: false, shop: null, osmBrands: ["intermarche"] },
  { id: "leclerc", name: "E.Leclerc", website: "https://leclerc.pl/", stores: true, online: null, wholesale: false, shop: "leclerc", osmBrands: ["e.leclerc", "leclerc"] },
  { id: "spar", name: "SPAR", website: "https://spar.pl/", stores: true, online: null, wholesale: false, shop: null, osmBrands: ["spar", "eurospar"] },
  { id: "selgros", name: "Selgros", website: "https://selgros.pl/", stores: true, online: null, wholesale: true, shop: null, osmBrands: ["selgros"] },
  { id: "makro", name: "Makro", website: "https://www.makro.pl/", stores: true, online: null, wholesale: true, shop: null, osmBrands: ["makro"] },
];

const BY_ID = new Map(RETAILERS.map((retailer) => [retailer.id, retailer]));

export function retailerById(id: string): Retailer | null {
  return BY_ID.get(id as RetailerId) ?? null;
}

/** The retailer behind an existing price-screen shop id. */
export function retailerForShop(shop: Shop): Retailer | null {
  return RETAILERS.find((retailer) => retailer.shop === shop) ?? null;
}

/**
 * The chain an OpenStreetMap shop belongs to, from its brand (or, without
 * one, its name): "Carrefour Market" -> carrefour. Null for shops that are
 * not one of these chains (Rossmann, a mall).
 */
export function retailerForOsm(brand: string | null | undefined, name?: string | null): Retailer | null {
  for (const text of [brand, name]) {
    if (!text) continue;
    const folded = fold(text).replace(/\s+/g, " ").trim();
    const found = RETAILERS.find((retailer) =>
      retailer.osmBrands.some((osm) => folded === osm || folded.startsWith(`${osm} `)),
    );
    if (found) return found;
  }
  return null;
}
