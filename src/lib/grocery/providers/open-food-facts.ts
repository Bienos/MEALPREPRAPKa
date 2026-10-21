/**
 * Open Food Facts: what a barcode is (name, brand, pack, category, nutrition,
 * ingredients), under the ODbL. Read through the documented API: product by
 * barcode (v3, recommended for new integrations; v2 answers parse too) and,
 * for the pilot, the search with a Poland country filter.
 *
 * Its limits are the API's own: 15 product reads and 10 searches a minute per
 * IP, a User-Agent naming the app. Products are cached in grocery_products
 * for 30 days, so the app asks once per barcode.
 *
 * A product here is metadata only. Its country tags are entered by
 * volunteers and are not proof it is sold in Poland (a Mlekpol cheese with a
 * 590 barcode is tagged only "United Kingdom").
 *
 * Not `server-only` so the tests can import it; only server code fetches.
 */

import { z } from "zod";

import { canonicalGtin, displayGtin } from "../gtin.ts";
import { parseQuantity, type Quantity } from "../units.ts";

export const OFF_ORIGIN = "https://world.openfoodfacts.org";
/** A product is read again after this long. */
export const OFF_CACHE_DAYS = 30;

const FIELDS = [
  "code",
  "product_name",
  "product_name_pl",
  "brands",
  "quantity",
  "product_quantity",
  "product_quantity_unit",
  "categories_tags",
  "countries_tags",
  "nutriments",
  "ingredients_text_pl",
].join(",");

/** "MealPrep/0.1 (contact)" — the identification the API asks for. */
export function offUserAgent(contact: string | null): string {
  return `MealPrep/0.1 (private meal-planning app; ${contact ?? "+https://github.com/Bienos/MEALPREPRAPKa"})`;
}

export function offProductUrl(gtin: string): string {
  return `${OFF_ORIGIN}/api/v3/product/${displayGtin(gtin)}?fields=${FIELDS}`;
}

export function offSearchUrl(terms: string, pageSize = 5): string {
  const params = new URLSearchParams({
    search_terms: terms,
    tagtype_0: "countries",
    tag_contains_0: "contains",
    tag_0: "poland",
    json: "1",
    page_size: String(pageSize),
    fields: FIELDS,
  });
  return `${OFF_ORIGIN}/cgi/search.pl?${params.toString()}`;
}

export type OffProduct = {
  /** GTIN-14. */
  gtin: string;
  name: string;
  brand: string | null;
  pack: Quantity | null;
  categories: string[];
  countries: string[];
  /** Per 100 g (or ml) as entered; null when the product page has none. */
  nutrition: { kcal: number | null; proteinG: number | null; fatG: number | null; carbsG: number | null } | null;
  ingredientsText: string | null;
  url: string;
};

const nutrimentsSchema = z.record(z.string(), z.unknown());

const productSchema = z.looseObject({
  code: z.string(),
  product_name: z.string().nullish(),
  product_name_pl: z.string().nullish(),
  brands: z.string().nullish(),
  quantity: z.string().nullish(),
  product_quantity: z.union([z.number(), z.string()]).nullish(),
  product_quantity_unit: z.string().nullish(),
  categories_tags: z.array(z.string()).nullish(),
  countries_tags: z.array(z.string()).nullish(),
  nutriments: nutrimentsSchema.nullish(),
  ingredients_text_pl: z.string().nullish(),
});

const envelopeSchema = z.looseObject({
  code: z.string().nullish(),
  // v2: 1 / 0; v3: "success" / "failure" (and "success_with_warnings").
  status: z.union([z.number(), z.string()]),
  product: z.unknown().optional(),
});

/** A product answer, v2 or v3. null when the barcode is not in the database. Throws on anything else. */
export function parseOffProduct(json: unknown): OffProduct | null {
  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) throw new Error("Open Food Facts zmieniło format odpowiedzi.");
  const { status, product } = envelope.data;
  const found = status === 1 || (typeof status === "string" && status.startsWith("success"));
  if (!found || product === undefined) return null;
  return toProduct(product);
}

/** A search answer: the products with a readable barcode and name. */
export function parseOffSearch(json: unknown): OffProduct[] {
  const products = (json as { products?: unknown } | null)?.products;
  if (!Array.isArray(products)) throw new Error("Open Food Facts zmieniło format wyszukiwania.");
  return products.flatMap((raw) => {
    try {
      const product = toProduct(raw);
      return product ? [product] : [];
    } catch {
      return [];
    }
  });
}

function toProduct(raw: unknown): OffProduct | null {
  const product = productSchema.parse(raw);
  const gtin = canonicalGtin(product.code);
  const name = (product.product_name_pl || product.product_name || "").replace(/\s+/g, " ").trim();
  if (!gtin || !name) return null;
  return {
    gtin,
    name,
    brand: product.brands?.split(",")[0]?.trim() || null,
    pack: packOf(product),
    categories: product.categories_tags ?? [],
    countries: product.countries_tags ?? [],
    nutrition: nutritionOf(product.nutriments ?? null),
    ingredientsText: product.ingredients_text_pl?.trim() || null,
    url: `${OFF_ORIGIN}/product/${displayGtin(gtin)}`,
  };
}

function packOf(product: z.infer<typeof productSchema>): Quantity | null {
  const amount = Number(product.product_quantity);
  const unit = product.product_quantity_unit?.toLowerCase();
  if (amount > 0 && (unit === "g" || unit === "ml")) return { amount, unit };
  return product.quantity ? parseQuantity(product.quantity) : null;
}

function nutritionOf(nutriments: Record<string, unknown> | null): OffProduct["nutrition"] {
  if (!nutriments) return null;
  const value = (key: string) => {
    const number = Number(nutriments[key]);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  const nutrition = {
    kcal: value("energy-kcal_100g"),
    proteinG: value("proteins_100g"),
    fatG: value("fat_100g"),
    carbsG: value("carbohydrates_100g"),
  };
  return Object.values(nutrition).every((one) => one === null) ? null : nutrition;
}

/* Fetching ------------------------------------------------------------------ */

/** Product reads allowed per minute and the gap kept between them in this process. */
const PRODUCT_GAP_MS = 4_100;
const SEARCH_GAP_MS = 6_100;
let nextProductAt = 0;
let nextSearchAt = 0;

async function waitTurn(kind: "product" | "search"): Promise<void> {
  const now = Date.now();
  const at = kind === "product" ? nextProductAt : nextSearchAt;
  const start = Math.max(now, at);
  if (kind === "product") nextProductAt = start + PRODUCT_GAP_MS;
  else nextSearchAt = start + SEARCH_GAP_MS;
  if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));
}

async function getJson(url: string, userAgent: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": userAgent, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("Nie udało się połączyć z Open Food Facts.");
  }
  if (response.status === 429) throw new Error("Open Food Facts prosi o zwolnienie (limit zapytań). Spróbuj za minutę.");
  // A barcode it does not know answers 404 with a JSON body that says so.
  if (!response.ok && response.status !== 404) throw new Error(`Open Food Facts odpowiedziało błędem ${response.status}.`);
  return response.json();
}

/** One barcode, politely spaced. null when Open Food Facts does not know it. */
export async function fetchOffProduct(gtin: string, userAgent: string): Promise<OffProduct | null> {
  await waitTurn("product");
  return parseOffProduct(await getJson(offProductUrl(gtin), userAgent));
}

/** Products in Poland whose text matches (pilot measurement only), politely spaced. */
export async function searchOffProducts(terms: string, userAgent: string, pageSize = 5): Promise<OffProduct[]> {
  await waitTurn("search");
  return parseOffSearch(await getJson(offSearchUrl(terms, pageSize), userAgent));
}
