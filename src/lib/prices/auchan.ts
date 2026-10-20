/**
 * Auchan shelf prices: the regular price of a product in Auchan's online shop.
 *
 * zakupy.auchan.pl lists a sitemap of its categories in robots.txt (which
 * keeps crawlers out of the search and the API, not out of category pages).
 * Every category page embeds its first 50 products as JSON: name, price now,
 * price per kilo / litre / piece, and whether it is in stock. So one request
 * prices a whole shelf: for each item on my list the few shelves that could
 * hold it, only when I tap, a batch at a time.
 *
 * These are the online shop's prices; the hypermarket can differ a little.
 *
 * Not `server-only` so the tests can import it; only server code uses it.
 */

import { parsePack } from "./pack.ts";
import type { CategoryEntry, ShelfPrice } from "./types.ts";

export const AUCHAN_CATEGORY_SITEMAP = "https://zakupy.auchan.pl/sitemaps/sitemap-categories-part1.xml";

const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/* Category pages ------------------------------------------------------------ */

/** The food shelves: /categories/{path in plain words}/{id}. */
export function parseAuchanCategories(xml: string): CategoryEntry[] {
  const categories: CategoryEntry[] = [];
  for (const [, url] of xml.matchAll(/<loc>\s*([^<\s]+\/categories\/[^<\s]+)\s*<\/loc>/g)) {
    const path = safeDecode(url.split("/categories/")[1]).split("/").slice(0, -1);
    if (!/^(artykuły-spożywcze|zdrowa-żywność)$/.test(path[0] ?? "")) continue;
    categories.push({ url, path: path.map((part) => part.replace(/-/g, " ")).join(" / ") });
  }
  if (categories.length === 0) throw new Error("Auchan zmienił mapę kategorii (brak półek).");
  return categories;
}

type StateProduct = {
  retailerProductId?: unknown;
  available?: unknown;
  name?: unknown;
  price?: { current?: { amount?: unknown }; unit?: { label?: unknown; current?: { amount?: unknown } } };
};

/**
 * The products of a category page, priced. The page embeds its first 50
 * products (name, price now, price per kilo / litre / piece) in the state it
 * is built from; what is not in stock is left out. Sold by weight ("na wagę"):
 * the price per kilo, loose. Else the pack is the price over the price per
 * unit, or the one in the name.
 */
export function parseAuchanCategoryPage(html: string, sourceUrl: string): ShelfPrice[] {
  const start = html.indexOf("window.__INITIAL_STATE__=");
  if (start === -1) throw new Error("Auchan zmienił stronę kategorii (brak danych).");
  const end = html.indexOf("</script>", start);
  let state: unknown;
  try {
    state = JSON.parse(
      html
        .slice(start + "window.__INITIAL_STATE__=".length, end)
        .trim()
        .replace(/;$/, ""),
    );
  } catch {
    throw new Error("Auchan zmienił stronę kategorii (nieczytelne dane).");
  }
  const entities = findKey(state, "productEntities") as Record<string, StateProduct> | undefined;
  if (!entities) return [];

  const prices: ShelfPrice[] = [];
  for (const product of Object.values(entities)) {
    const name = typeof product.name === "string" ? product.name.replace(/\s+/g, " ").trim() : "";
    const id = typeof product.retailerProductId === "string" ? product.retailerProductId : "";
    const price = Number(product.price?.current?.amount);
    if (!name || !id || !(price > 0) || product.available !== true) continue;
    const label = String(product.price?.unit?.label ?? "");
    const unitPrice = Number(product.price?.unit?.current?.amount);
    const base = { productKey: `auchan:${id}`, name, sourceUrl };
    const perKilo = label.endsWith("per.kg");
    const perLitre = label.endsWith("per.litre");

    if (/na wagę/i.test(name) && (perKilo || perLitre) && unitPrice > 0) {
      prices.push({ ...base, packQuantity: 1000, packUnit: perKilo ? "g" : "ml", loose: true, price: unitPrice });
      continue;
    }
    const named = parsePack(name);
    if (named) {
      prices.push({ ...base, packQuantity: named.quantity, packUnit: named.unit, loose: false, price });
    } else if ((perKilo || perLitre) && unitPrice > 0) {
      prices.push({
        ...base,
        packQuantity: Math.round((price / unitPrice) * 1000),
        packUnit: perKilo ? "g" : "ml",
        loose: false,
        price,
      });
    } else if (label.endsWith("per.each") && unitPrice > 0) {
      prices.push({
        ...base,
        packQuantity: Math.max(1, Math.round(price / unitPrice)),
        packUnit: "szt",
        loose: false,
        price,
      });
    }
  }
  return prices;
}

function findKey(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findKey(item, key);
      if (found !== undefined) return found;
    }
  } else if (value && typeof value === "object") {
    if (key in value) return (value as Record<string, unknown>)[key];
    for (const item of Object.values(value)) {
      const found = findKey(item, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/* Fetching ------------------------------------------------------------------ */

/**
 * Categories read per tap. The shop's protection answers "202" with an empty
 * page when requests come too fast; that is its limit, not an error to get
 * around: two at a time, and the read stops at the first such answer (what was
 * read is kept, the rest waits for the next tap).
 */
export const MAX_AUCHAN_CATEGORIES = 40;
const PARALLEL = 2;

export async function fetchAuchanCategoryList(): Promise<CategoryEntry[]> {
  return parseAuchanCategories(await fetchText(AUCHAN_CATEGORY_SITEMAP, 30_000));
}

export type CategoryRead = {
  prices: ShelfPrice[];
  /** The category pages that were read. */
  done: CategoryEntry[];
  failed: number;
  /** The shop asked to slow down: the rest was not tried. */
  limited: boolean;
};

class LimitedError extends Error {}

/** Reads these category pages, two at a time. A page that fails is counted; a "slow down" stops the read. */
export async function fetchAuchanCategories(categories: CategoryEntry[]): Promise<CategoryRead> {
  const read: CategoryRead = { prices: [], done: [], failed: 0, limited: false };
  const batch = categories.slice(0, MAX_AUCHAN_CATEGORIES);
  for (let index = 0; index < batch.length && !read.limited; index += PARALLEL) {
    const results = await Promise.allSettled(
      batch.slice(index, index + PARALLEL).map(async (category) => {
        const prices = parseAuchanCategoryPage(await fetchText(category.url, 20_000, true), category.url);
        return { category, prices };
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        read.prices.push(...result.value.prices);
        read.done.push(result.value.category);
      } else if (result.reason instanceof LimitedError) read.limited = true;
      else read.failed++;
    }
  }
  return read;
}

async function fetchText(url: string, timeout: number, slowDown = false): Promise<string> {
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
  if (slowDown && response.status === 202) throw new LimitedError("Auchan prosi o zwolnienie.");
  if (!response.ok) throw new Error(`Sklep Auchan odpowiedział błędem ${response.status}.`);
  return response.text();
}
