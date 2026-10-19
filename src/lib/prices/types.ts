/**
 * Shared shapes for shop prices. Plain types and constants only, so client
 * components can import them without pulling in Zod or server code.
 */

import type { Unit } from "../meals/ingredients.ts";

/**
 * Shops the shopping list is priced at. Lidl's promotions come from lidl.pl;
 * the others' from their leaflets, read through Blix (`blix.ts`). My own
 * prices work for any of them.
 */
export const SHOPS = [
  "lidl",
  "biedronka",
  "kaufland",
  "aldi",
  "netto",
  "dino",
  "carrefour",
  "auchan",
  "stokrotka",
  "zabka",
  "leclerc",
] as const;
export type Shop = (typeof SHOPS)[number];

export const SHOP_LABELS: Record<Shop, string> = {
  lidl: "Lidl",
  biedronka: "Biedronka",
  kaufland: "Kaufland",
  aldi: "Aldi",
  netto: "Netto",
  dino: "Dino",
  carrefour: "Carrefour",
  auchan: "Auchan",
  stokrotka: "Stokrotka",
  zabka: "Żabka",
  leclerc: "Leclerc",
};

/** "w Lidlu", for sentences. */
export const SHOP_IN: Record<Shop, string> = {
  lidl: "w Lidlu",
  biedronka: "w Biedronce",
  kaufland: "w Kauflandzie",
  aldi: "w Aldi",
  netto: "w Netto",
  dino: "w Dino",
  carrefour: "w Carrefourze",
  auchan: "w Auchan",
  stokrotka: "w Stokrotce",
  zabka: "w Żabce",
  leclerc: "w Leclerc",
};

/** One promotion, the same shape whichever shop it came from. */
export type ShopPromo = {
  shop: Shop;
  /** The shop's own product id, stable across weeks: "lidl:11405938". */
  productKey: string;
  name: string;
  packQuantity: number | null;
  packUnit: Unit | null;
  /** Sold by weight: the price is per pack and you pay for exactly what you take. */
  loose: boolean;
  /** Price per pack while the promotion applies (per pack within a multi-buy). */
  promoPrice: number;
  /** Struck-through price, when the shop shows one. */
  regularPrice: number | null;
  /** YYYY-MM-DD, inclusive, in the app's timezone. */
  validFrom: string;
  validTo: string | null;
  /** The shop's fine print: limits, deposits, how the deal works. */
  conditions: string;
  /** Needs the shop's app (Lidl Plus, Moja Biedronka). */
  appOnly: boolean;
  /** "1+1 gratis", "-50% przy zakupie 2"; null for a plain price cut. */
  multibuy: string | null;
  /** Packs it takes for the promo price to apply. 1 when it is not a multi-buy. */
  multibuyMin: number;
  sourceUrl: string;
  /** A regular shelf price from the shop's own catalogue, not a deal. */
  shelf?: boolean;
};

/** One product's regular shelf price from a shop's own catalogue, as stored. */
export type ShelfPrice = {
  productKey: string;
  name: string;
  /** What the price is for: a pack, or a kilo of something sold by weight. */
  packQuantity: number;
  packUnit: Unit;
  loose: boolean;
  price: number;
  sourceUrl: string;
};

/** My own price for a shopping item at a shop. */
export type ShopPrice = {
  itemName: string;
  shop: Shop;
  productLabel: string;
  packQuantity: number;
  packUnit: Unit;
  price: number;
};

/** A "pasuje?" answer: this promo product is (or is not) the shopping item. */
export type ProductLink = {
  itemName: string;
  shop: Shop;
  productKey: string;
  matches: boolean;
  /** What the price is for, given when the offer did not say it (leaflet prices often do not). */
  packQuantity: number | null;
  packUnit: Unit | null;
  /** The price is per kilo (or litre) and I pay for what I take. */
  packLoose: boolean;
};
