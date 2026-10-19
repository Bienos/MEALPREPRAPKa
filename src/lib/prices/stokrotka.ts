/**
 * Stokrotka shelf prices, from the product feed its online shop publishes.
 *
 * sklep.stokrotka.pl serves a Google Merchant feed (/xml/google_products.xml,
 * ~20 000 products, ~18 MB) and its robots.txt allows it explicitly. Each item
 * has a title with the pack ("Piątnica Serek wiejski naturalny 200 g"), a
 * price and whether it is in stock. Fresh meat is sold by weight and says so
 * in the title ("Filet z piersi kurczaka (średnia waga to 0,3kg)"): its
 * price is per kilo. One request, only when I tap, and the prices that match
 * my list are kept for a day.
 *
 * Not `server-only` so the tests can import it; only server code uses it.
 */

import { parsePack } from "./pack.ts";
import type { ShelfPrice } from "./types.ts";

export const STOKROTKA_FEED = "https://sklep.stokrotka.pl/xml/google_products.xml";
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** A feed item before it is matched to my list. */
export type FeedItem = {
  productKey: string;
  name: string;
  url: string;
  price: number;
  inStock: boolean;
  /** Sold by weight: the price is per kilo. */
  byWeight: boolean;
};

/** The feed's items. Throws when it no longer looks like the feed. */
export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  let seen = 0;
  for (const [, body] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    seen++;
    const id = tag(body, "g:id");
    const name = tag(body, "title");
    const url = tag(body, "link");
    const price = Number(tag(body, "g:price")?.match(/(\d+(?:\.\d+)?)/)?.[1]);
    if (!id || !name || !url || !(price > 0)) continue;
    items.push({
      productKey: `stokrotka:${id}`,
      name,
      url,
      price,
      inStock: tag(body, "g:availability") === "in stock",
      byWeight: /średnia waga/i.test(name),
    });
  }
  if (seen === 0) throw new Error("Stokrotka zmieniła plik z produktami (brak pozycji).");
  return items;
}

function tag(body: string, name: string): string | null {
  const match = body.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  if (!match) return null;
  return decode(match[1].replace(/<!\[CDATA\[|\]\]>/g, "")).trim() || null;
}

function decode(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * A feed item as a shelf price: per kilo when sold by weight, else the pack
 * named in the title. null when the title names no pack.
 */
export function toShelfPrice(item: FeedItem): ShelfPrice | null {
  if (item.byWeight) {
    return {
      productKey: item.productKey,
      name: item.name,
      packQuantity: 1000,
      packUnit: "g",
      loose: true,
      price: item.price,
      sourceUrl: item.url,
    };
  }
  const pack = parsePack(item.name);
  if (!pack) return null;
  return {
    productKey: item.productKey,
    name: item.name,
    packQuantity: pack.quantity,
    packUnit: pack.unit,
    loose: false,
    price: item.price,
    sourceUrl: item.url,
  };
}

/** One request for the whole feed (it is built live and takes about 40 seconds). */
export async function fetchStokrotkaFeed(): Promise<FeedItem[]> {
  let response: Response;
  try {
    response = await fetch(STOKROTKA_FEED, {
      headers: { "user-agent": USER_AGENT, accept: "application/xml,text/xml;q=0.9,*/*;q=0.8" },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    throw new Error("Nie udało się pobrać cen Stokrotki (to trwa do minuty). Spróbuj jeszcze raz.");
  }
  if (!response.ok) throw new Error(`Stokrotka odpowiedziała błędem ${response.status}.`);
  return parseFeed(await response.text());
}
