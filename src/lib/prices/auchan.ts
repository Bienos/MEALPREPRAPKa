/**
 * Auchan shelf prices: the regular price of a product in Auchan's online shop.
 *
 * zakupy.auchan.pl lists a sitemap of its whole range (~25 000 product pages)
 * in robots.txt, and robots.txt keeps crawlers out of the search and the API,
 * not out of product pages. Every product page carries the product as JSON:
 * name, price, pack ("0.15kg", "10 na paczkę", or "150g - 99999g" for what
 * is sold by weight), the price per kilo and whether it is in stock. So, like
 * Biedronka: one request for the sitemap, then one per product page for the
 * few products the rules think are on my list, only when I tap.
 *
 * These are the online shop's prices; the hypermarket can differ a little.
 *
 * Not `server-only` so the tests can import it; only server code uses it.
 */

import type { Unit } from "../meals/ingredients.ts";
import type { CatalogEntry } from "./biedronka.ts";
import { parsePack } from "./pack.ts";
import type { ShelfPrice } from "./types.ts";

export const AUCHAN_SITEMAP = "https://zakupy.auchan.pl/sitemaps/sitemap-products-part1.xml";

const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/* Sitemap ------------------------------------------------------------------- */

/**
 * Product pages are /products/{name in plain words}/{8-digit id}; the image
 * entries inside each <url> are left out. The name is only for matching.
 */
export function parseAuchanSitemap(xml: string): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const [, url] of xml.matchAll(/<url>\s*<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const match = url.match(/\/products\/([^/]+)\/(\d{8})$/);
    if (!match) continue;
    // "banany owoce auchan na wagę kiść 4 6 szt ok 1 kg": what it weighs says nothing about
    // what it is, and "szt" would keep it from pricing grams; the page gives the price per kilo.
    const name = safeDecode(match[1])
      .replace(/-/g, " ")
      .replace(/\s+na wagę(?:\s.*)?$/, "");
    entries.push({ productKey: `auchan:${match[2]}`, name, url });
  }
  if (entries.length === 0) throw new Error("Auchan zmienił mapę strony (brak produktów).");
  return entries;
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/* Product page -------------------------------------------------------------- */

/**
 * Reads this product's own JSON from its page (the page also carries other
 * products, so it is found by id). Sold by weight: the price per kilo, loose.
 * Out of stock or no price: null.
 */
export function parseAuchanProduct(html: string, entry: CatalogEntry): ShelfPrice | null {
  const id = entry.productKey.replace(/^auchan:/, "");
  const start = html.indexOf(`"retailerProductId":"${id}"`);
  if (start === -1) return null;
  const product = html.slice(start, start + 2500);
  const field = (pattern: RegExp) => product.match(pattern)?.[1] ?? null;

  const name = (field(/"name":"((?:[^"\\]|\\.)*)"/) ?? entry.name).replace(/\s+/g, " ").trim();
  const price = Number(field(/"price":\{"amount":"([\d.]+)"/));
  const unitPrice = Number(field(/"unitPrice":\{"price":\{"amount":"([\d.]+)"/));
  const unit = field(/"unitPrice":\{"price":\{[^}]*\},"unit":"fop\.price\.per\.(\w+)"/);
  const packSize = field(/"packSizeDescription":"([^"]*)"/) ?? "";
  if (field(/"available":(true|false)/) !== "true") return null;

  const base = { productKey: entry.productKey, name, sourceUrl: entry.url };
  const perKilo = unit === "kg" || unit === "litre" || unit === "l";
  // "150g - 99999g": I pay for what I take, at the price per kilo.
  if (perKilo && /\d\s*g?\s*-\s*\d/.test(packSize) && unitPrice > 0) {
    return { ...base, packQuantity: 1000, packUnit: unit === "kg" ? "g" : "ml", loose: true, price: unitPrice };
  }
  if (!(price > 0)) return null;
  const pieces = packSize.match(/^(\d+)\s+na paczk/);
  const pack: { quantity: number; unit: Unit } | null = pieces
    ? { quantity: Number(pieces[1]), unit: "szt" }
    : (parsePack(packSize) ?? parsePack(name));
  if (!pack) return null;
  return { ...base, packQuantity: pack.quantity, packUnit: pack.unit, loose: false, price };
}

/* Fetching ------------------------------------------------------------------ */

const PARALLEL = 3;
export const MAX_AUCHAN_PAGES = 45;

export async function fetchAuchanSitemap(): Promise<CatalogEntry[]> {
  return parseAuchanSitemap(await fetchText(AUCHAN_SITEMAP, 30_000));
}

export type AuchanResult = { prices: ShelfPrice[]; read: number; failed: number };

/** Reads these product pages, a few at a time. A page that fails is skipped and counted. */
export async function fetchAuchanPrices(entries: CatalogEntry[]): Promise<AuchanResult> {
  const prices: ShelfPrice[] = [];
  let failed = 0;
  const batch = entries.slice(0, MAX_AUCHAN_PAGES);
  for (let index = 0; index < batch.length; index += PARALLEL) {
    const results = await Promise.allSettled(
      batch
        .slice(index, index + PARALLEL)
        .map(async (entry) => parseAuchanProduct(await fetchText(entry.url, 10_000), entry)),
    );
    for (const result of results) {
      if (result.status === "rejected") failed++;
      else if (result.value) prices.push(result.value);
    }
  }
  return { prices, read: batch.length, failed };
}

async function fetchText(url: string, timeout: number): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "pl-PL,pl;q=0.9",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new Error("Nie udało się połączyć ze sklepem Auchan. Spróbuj za chwilę.");
  }
  if (!response.ok) throw new Error(`Sklep Auchan odpowiedział błędem ${response.status}.`);
  return response.text();
}
