/**
 * Shapes shared by the grocery adapters, the eligibility engine and the data
 * access layer. Plain types and constants only, client-safe.
 */

import type { ProviderId } from "./providers.ts";
import type { RetailerId } from "./retailers.ts";
import type { Quantity } from "./units.ts";

/** What kind of observation a price is. Whether it can be used today is decided by `eligibility.ts`. */
export type PriceKind =
  /** The retailer's price now, from its own catalogue or feed. */
  | "current_offer"
  /** A leaflet, app or price-list offer with validity dates. */
  | "published_promotion"
  /** An older observation of a retailer price. */
  | "historical"
  /** Someone else's observation with a proof (Open Prices). */
  | "community"
  /** What I paid, from my receipt. */
  | "receipt"
  /** A price I typed. */
  | "manual";

export type PriceType = "regular" | "promotion" | "loyalty" | "multibuy" | "clearance";

export type EvidenceType =
  | "api_record"
  | "feed_record"
  | "web_page"
  | "leaflet"
  | "receipt"
  | "price_tag"
  | "manual_entry";

/** Loyalty apps and cards whose prices need membership. */
export const LOYALTY_PROGRAMS = [
  "lidl_plus",
  "moja_biedronka",
  "zappka",
  "kaufland_card",
  "moj_carrefour",
  "auchan",
  "stokrotka",
] as const;
export type LoyaltyProgram = (typeof LOYALTY_PROGRAMS)[number];

export const LOYALTY_LABELS: Record<LoyaltyProgram, string> = {
  lidl_plus: "Lidl Plus",
  moja_biedronka: "Moja Biedronka",
  zappka: "Żappka",
  kaufland_card: "Kaufland Card",
  moj_carrefour: "Mój Carrefour",
  auchan: "Auchan (aplikacja)",
  stokrotka: "Stokrotka (aplikacja)",
};

/** The app a chain's "app only" prices need. */
export const RETAILER_LOYALTY: Partial<Record<RetailerId, LoyaltyProgram>> = {
  lidl: "lidl_plus",
  biedronka: "moja_biedronka",
  zabka: "zappka",
  kaufland: "kaufland_card",
  carrefour: "moj_carrefour",
  auchan: "auchan",
  stokrotka: "stokrotka",
};

/** Promotion terms as data. The source's own wording stays in `text`. */
export type PriceConditions = {
  /** Needs this app or card; null when anyone gets the price. */
  loyaltyProgram: LoyaltyProgram | null;
  /** Needs the chain's app, the program not named by the source. */
  appOnly: boolean;
  /** Packs it takes for the price to apply ("2+1", "-50% przy zakupie 2"). */
  minQuantity: number;
  multibuy: string | null;
  /** "max 6 szt. na klienta". */
  quantityLimit: number | null;
  /** A bottle or can deposit added at the till. */
  depositGrosz: number;
  text: string;
};

export const NO_CONDITIONS: PriceConditions = {
  loyaltyProgram: null,
  appOnly: false,
  minQuantity: 1,
  multibuy: null,
  quantityLimit: null,
  depositGrosz: 0,
  text: "",
};

/** Where a price applies. */
export type PriceRegion = {
  channel: "store" | "online";
  /** One price in every shop of the chain (Lidl, a national leaflet). */
  national: boolean;
  /** The town of the shop it was seen in, when it was one shop. */
  city: string | null;
  /** For an online shop: the towns it delivers to; null when not known. */
  deliveryTowns: readonly string[] | "all" | null;
};

/** One price, from any source, in one shape. */
export type PriceFact = {
  providerId: ProviderId | null;
  retailer: RetailerId | null;
  productName: string;
  amountGrosz: number;
  currency: string;
  /** What the amount is for. "pack" with `loose` = the pack is a reference weight and you pay for what you take. */
  per: "pack" | "kg" | "l" | "piece";
  pack: Quantity | null;
  loose: boolean;
  priceType: PriceType;
  regularGrosz: number | null;
  kind: PriceKind;
  /** ISO timestamp of the observation. */
  observedAt: string;
  /** YYYY-MM-DD, inclusive. */
  validFrom: string | null;
  validTo: string | null;
  conditions: PriceConditions;
  evidence: { type: EvidenceType; url: string | null; recordId: string | null } | null;
  region: PriceRegion;
  availability: "in_stock" | "out_of_stock" | "unknown";
  /** The pack or the price was worked out (an assumed pack, a price from a unit price), not read. */
  derived: boolean;
};

/** How I shop: what the eligibility engine needs to know about me. */
export type ShoppingPreferences = {
  channel: "store" | "online" | "both";
  loyalty: LoyaltyProgram[];
  /** Brands never to suggest. */
  excludedBrands: string[];
  /** Shops shown first on the card. */
  preferredRetailers: RetailerId[];
};
