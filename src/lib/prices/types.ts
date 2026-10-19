/**
 * Shared shapes for shop prices. Plain types and constants only, so client
 * components can import them without pulling in Zod or server code.
 */

import type { Unit } from "../meals/ingredients.ts";

/**
 * Shops the shopping list is priced at. Promotions are read only for shops
 * with an adapter (Lidl); Biedronka publishes its offers as leaflet images, so
 * it is priced from my own prices alone.
 */
export const SHOPS = ["lidl", "biedronka"] as const;
export type Shop = (typeof SHOPS)[number];

export const SHOP_LABELS: Record<Shop, string> = { lidl: "Lidl", biedronka: "Biedronka" };
/** "w Lidlu", for sentences. */
export const SHOP_IN: Record<Shop, string> = { lidl: "w Lidlu", biedronka: "w Biedronce" };
export const PROMO_SHOPS: readonly Shop[] = ["lidl"];

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
};
