/**
 * Biedronka shelf prices: the regular price of a product, not a leaflet deal.
 *
 * Biedronka's online shop (zakupy.biedronka.pl) publishes a sitemap of its
 * whole grocery range (~2000 product pages) and every product page shows its
 * price, its pack and its price per kilo. robots.txt keeps crawlers out of the
 * shop's search, not out of product pages. So: one request for the sitemap,
 * then one per product page for the few products the rules think are on my
 * list, only when I tap "Sprawdź promocje", and a price is kept for weeks.
 *
 * These are the online shop's prices (with delivery); the shop on the corner
 * can differ a little. The card says so.
 *
 * Not `server-only` so the tests can import it; only server code uses it.
 */

import type { Unit } from "../meals/ingredients.ts";
import { parsePack } from "./pack.ts";
import type { CategoryEntry, ShelfPrice } from "./types.ts";

const ORIGIN = "https://zakupy.biedronka.pl";
export const BIEDRONKA_SITEMAP = `${ORIGIN}/sitemap_0.xml`;

const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** A product page from the sitemap, named from its address. */
export type CatalogEntry = { productKey: string; name: string; url: string };

/* Sitemap ------------------------------------------------------------------- */

/**
 * Product pages end in a 10-digit product id; the words before it are the
 * product name in plain letters ("piatnica-piatnica-serek-wiejski-naturalny-200-g").
 */
export function parseSitemap(xml: string): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const [, url] of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const match = url.match(/\/([^/]+)-(\d{10})\.html$/);
    if (!match) continue;
    const slug = safeDecode(match[1]);
    entries.push({ productKey: `biedronka:${match[2]}`, name: slug.replace(/-/g, " "), url });
  }
  if (entries.length === 0) throw new Error("Biedronka zmieniła mapę strony (brak produktów).");
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
 * Reads a product page. The sale price comes as "2 <decimal>99</decimal>
 * /szt." (a pack) or "25 <decimal>49</decimal> /kg" (sold by weight); a
 * product out of stock online shows "N/A", and then the price per kilo and
 * the pack weight still give the pack price. null when there is no price.
 */
export function parseProductPage(html: string, entry: CatalogEntry): ShelfPrice | null {
  const name = text(html.match(/<h1[^>]*product-description__name[^>]*>([\s\S]*?)<\/h1>/)?.[1]) || entry.name;
  const sales = text(html.match(/<div class="price-product__sales">([\s\S]*?)<\/div>/)?.[1]);
  const packaging = text(html.match(/<div class="packaging-details">([\s\S]*?)<\/div>/)?.[1]);
  return shelfPriceFrom(name, sales, packaging, entry);
}

/** The price and pack of one product, from its sale price text and its packaging line. */
function shelfPriceFrom(name: string, sales: string, packaging: string, entry: CatalogEntry): ShelfPrice | null {
  // "2 99 /szt." or "25 49 /kg"
  const sale = sales.match(/(\d+)\s+(\d{2})\s*\/\s*(szt|kg|l)\b/i);
  // "0.2kg - 14,95 zł / kg", "ok. 600 g ~ 0.6kg - 25,49 zł / kg"
  const weight = packaging.match(/(\d+(?:\.\d+)?)\s*(kg|l)\b/i);
  // The unit price: per kilo or litre, or per piece ("10szt. - 1,15 zł / szt").
  const perUnit = packaging.match(/(\d+,\d{2})\s*zł\s*\/\s*(kg|l|szt)/i);
  const pieces = packaging.match(/(\d+)\s*szt/i);
  const kilos = weight ? Number(weight[1]) : null;
  const volume = weight?.[2].toLowerCase() === "l";

  if (sale && sale[3].toLowerCase() !== "szt") {
    // Sold by weight: the price is per kilo (or litre) and I pay for what I take.
    const price = Number(`${sale[1]}.${sale[2]}`);
    return {
      productKey: entry.productKey,
      name,
      packQuantity: 1000,
      packUnit: volume ? "ml" : "g",
      loose: true,
      price,
      sourceUrl: entry.url,
    };
  }

  const pack =
    kilos !== null && kilos > 0
      ? { quantity: Math.round(kilos * 1000), unit: (volume ? "ml" : "g") as Unit }
      : pieces
        ? { quantity: Number(pieces[1]), unit: "szt" as Unit }
        : parsePack(name);
  if (!pack) return null;

  // Out of stock online: the unit price times the pack.
  const unitPrice = perUnit ? Number(perUnit[1].replace(",", ".")) : null;
  const perPiece = perUnit?.[2].toLowerCase() === "szt";
  const price = sale
    ? Number(`${sale[1]}.${sale[2]}`)
    : unitPrice === null
      ? null
      : perPiece
        ? pack.unit === "szt"
          ? Math.round(unitPrice * pack.quantity * 100) / 100
          : null
        : pack.unit !== "szt"
          ? Math.round(unitPrice * (pack.quantity / 1000) * 100) / 100
          : null;
  if (price === null || !(price > 0)) return null;
  return {
    productKey: entry.productKey,
    name,
    packQuantity: pack.quantity,
    packUnit: pack.unit,
    loose: false,
    price,
    sourceUrl: entry.url,
  };
}

/* Category pages ------------------------------------------------------------ */

/**
 * The shop's category pages (the sitemap lists the ones with products): every
 * category page shows its first 32 products as tiles with name, price and pack,
 * so one request prices a whole shelf instead of one product.
 */
export function parseCategories(xml: string): CategoryEntry[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((match) => match[1])
    .filter((url) => !url.endsWith(".html"))
    .map((url) => ({
      url,
      path: safeDecode(new URL(url).pathname)
        .split("/")
        .filter(Boolean)
        .map((part) => part.replace(/-/g, " "))
        .join(" / "),
    }));
}

/** The tiles of a category page as shelf prices. A tile with no readable price is skipped. */
export function parseCategoryPage(html: string): ShelfPrice[] {
  const prices: ShelfPrice[] = [];
  for (const tile of html.split('<div class="product-tile js-product-tile').slice(1)) {
    const id = tile.match(/data-itemid="(\d{10})"/)?.[1];
    const url = tile.match(/<a href="([^"]+-\d{10}\.html)"/)?.[1];
    const name = text(tile.match(/itemprop="name"[^>]*>([\s\S]*?)<\/div>/)?.[1]);
    if (!id || !url || !name) continue;
    const sales = text(tile.match(/<div class="price-tile__sales">([\s\S]*?)<\/div>/)?.[1]);
    const packaging = text(tile.match(/<div class="packaging-details">([\s\S]*?)<\/div>/)?.[1]);
    const price = shelfPriceFrom(name, sales, packaging, { productKey: `biedronka:${id}`, name, url });
    if (price) prices.push(price);
  }
  return prices;
}

function text(fragment: string | undefined): string {
  return (fragment ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/* Fetching ------------------------------------------------------------------ */

/** Pages read at once, and at most per tap: gentle, and inside the request time limit. */
const PARALLEL = 3;
export const MAX_PAGES_PER_REFRESH = 45;

export async function fetchBiedronkaSitemap(): Promise<CatalogEntry[]> {
  return parseSitemap(await fetchText(BIEDRONKA_SITEMAP, 20_000));
}

export type ShelfResult = { prices: ShelfPrice[]; read: number; failed: number };

/** Reads these product pages, a few at a time. A page that fails is skipped and counted. */
export async function fetchShelfPrices(entries: CatalogEntry[]): Promise<ShelfResult> {
  const prices: ShelfPrice[] = [];
  let failed = 0;
  const batch = entries.slice(0, MAX_PAGES_PER_REFRESH);
  for (let index = 0; index < batch.length; index += PARALLEL) {
    const results = await Promise.allSettled(
      batch
        .slice(index, index + PARALLEL)
        .map(async (entry) => parseProductPage(await fetchText(entry.url, 10_000), entry)),
    );
    for (const result of results) {
      if (result.status === "rejected") failed++;
      else if (result.value) prices.push(result.value);
    }
  }
  return { prices, read: batch.length, failed };
}

/** Categories read per tap: the shop answers in about a second, three at a time. */
export const MAX_CATEGORIES_PER_REFRESH = 60;
const CATEGORY_PARALLEL = 3;

export async function fetchBiedronkaCategoryList(): Promise<CategoryEntry[]> {
  const urls = parseCategories(await fetchText(BIEDRONKA_SITEMAP, 20_000));
  if (urls.length === 0) throw new Error("Biedronka zmieniła mapę strony (brak kategorii).");
  return urls;
}

export type CategoryResult = { prices: ShelfPrice[]; done: CategoryEntry[]; failed: number; limited: boolean };

/** Reads these category pages, a few at a time. A page that fails is skipped and counted. */
export async function fetchBiedronkaCategories(categories: CategoryEntry[]): Promise<CategoryResult> {
  const read: CategoryResult = { prices: [], done: [], failed: 0, limited: false };
  const batch = categories.slice(0, MAX_CATEGORIES_PER_REFRESH);
  for (let index = 0; index < batch.length; index += CATEGORY_PARALLEL) {
    const results = await Promise.allSettled(
      batch.slice(index, index + CATEGORY_PARALLEL).map(async (category) => {
        const prices = parseCategoryPage(await fetchText(category.url, 15_000));
        return { category, prices };
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        read.prices.push(...result.value.prices);
        read.done.push(result.value.category);
      } else read.failed++;
    }
  }
  return read;
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
    throw new Error("Nie udało się połączyć ze sklepem Biedronki. Spróbuj za chwilę.");
  }
  if (!response.ok) throw new Error(`Sklep Biedronki odpowiedział błędem ${response.status}.`);
  return response.text();
}
