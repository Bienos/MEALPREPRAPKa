/**
 * Frisco shelf prices, from the product feed it publishes for everyone.
 *
 * frisco.pl lists its feed in robots.txt
 * (commerce.frisco.pl/api/v1/integration/feeds/public): the whole range,
 * ~15 000 products, ~57 MB of JSON in a few seconds, no login. Each product
 * has a price for one pack and that pack's size in kilos, litres or pieces.
 * Frisco is an online grocer, so its prices are a reference for the shop on
 * the corner, not a shelf price in it.
 *
 * Not `server-only` so the tests can import it; only server code uses it.
 */

import { parsePack } from "./pack.ts";
import type { ShelfPrice } from "./types.ts";

export const FRISCO_FEED = "https://commerce.frisco.pl/api/v1/integration/feeds/public?language=pl";
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** A feed product before it is matched to my list. */
export type FriscoItem = {
  productKey: string;
  name: string;
  url: string;
  price: number;
  inStock: boolean;
  /** Pack size in the feed's own unit (kilos, litres or pieces), or null. */
  grammage: number | null;
  unit: "Kilogram" | "Litre" | "Piece";
};

type RawProduct = {
  id?: unknown;
  name?: { pl?: unknown };
  unitOfMeasure?: unknown;
  packSize?: unknown;
  grammage?: unknown;
  price?: { price?: unknown; priceAfterPromotion?: unknown };
  isAvailable?: unknown;
  productUrl?: unknown;
};

/** The feed's products. Throws when it no longer looks like the feed. */
export function parseFriscoFeed(json: unknown): FriscoItem[] {
  const products = (json as { products?: unknown } | null)?.products;
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error("Frisco zmieniło plik z produktami (brak pozycji).");
  }
  const items: FriscoItem[] = [];
  for (const raw of products as RawProduct[]) {
    const name = raw.name?.pl;
    const unit = raw.unitOfMeasure;
    // The regular price: a promotion is a leaflet-style deal, not the shelf price.
    const price = Number(raw.price?.price);
    if (typeof name !== "string" || !name || !(price > 0) || raw.id == null) continue;
    if (unit !== "Kilogram" && unit !== "Litre" && unit !== "Piece") continue;
    // packSize > 1 is a carton (12 packs of rice for one price): not what I buy on a shelf.
    if (Number(raw.packSize) > 1) continue;
    const grammage = Number(raw.grammage);
    items.push({
      productKey: `frisco:${String(raw.id)}`,
      name,
      url: typeof raw.productUrl === "string" ? raw.productUrl : "https://www.frisco.pl/",
      price,
      inStock: raw.isAvailable === true,
      grammage: grammage > 0 ? grammage : null,
      unit,
    });
  }
  return items;
}

/** Fresh produce sold by weight names a range ("(800g-1200g)", "480-720g", "ok. 500 g"); its price is for the average weight. */
const BY_WEIGHT = /\d+\s?g?\s*-\s*\d+\s?g\b|\bok\.\s*\d/i;

/**
 * The name as the matching should read it: what a by-weight product weighs
 * and how many pieces that is ("Banany kiść 4-6 szt. (800g-1200g)") says
 * nothing about what it is, and "szt." would keep it from pricing grams.
 */
export function matchName(item: FriscoItem): string {
  if (item.unit === "Piece" || !BY_WEIGHT.test(item.name)) return item.name;
  return item.name
    .replace(/\(?\s*\d+\s?g?\s*-\s*\d+\s?g\s*\)?/gi, "")
    .replace(/\bok\.\s*[\d,.]+\s?(?:kg|g)\b/gi, "")
    .replace(/\d+\s*-\s*\d+\s*szt\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A product as a shelf price: loose at its average weight when sold by weight, else the pack the
 * name gives ("10 szt.", "4x100g"), else the pack size the feed gives. null
 * when no pack can be told.
 */
export function toFriscoShelfPrice(item: FriscoItem): ShelfPrice | null {
  const base = { productKey: item.productKey, name: item.name, price: item.price, sourceUrl: item.url };
  // The price is for the average weight the feed gives ("(120g-180g)", 0.15 kg); I pay for what I take.
  if (item.unit !== "Piece" && BY_WEIGHT.test(item.name) && item.grammage !== null) {
    const packUnit = item.unit === "Litre" ? "ml" : "g";
    return { ...base, packQuantity: Math.round(item.grammage * 1000), packUnit, loose: true };
  }
  const named = parsePack(item.name);
  if (named) return { ...base, packQuantity: named.quantity, packUnit: named.unit, loose: false };
  if (item.unit === "Piece") return null;
  if (item.grammage === null) return null;
  return {
    ...base,
    packQuantity: Math.round(item.grammage * 1000),
    packUnit: item.unit === "Litre" ? "ml" : "g",
    loose: false,
  };
}

/** One request for the whole feed. */
export async function fetchFriscoFeed(): Promise<FriscoItem[]> {
  let response: Response;
  try {
    response = await fetch(FRISCO_FEED, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(50_000),
    });
  } catch {
    throw new Error("Nie udało się pobrać cen Frisco. Spróbuj jeszcze raz.");
  }
  if (!response.ok) throw new Error(`Frisco odpowiedziało błędem ${response.status}.`);
  return parseFriscoFeed(await response.json());
}
