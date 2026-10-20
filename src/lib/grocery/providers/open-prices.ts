/**
 * Open Prices (prices.openfoodfacts.org): prices people saw on receipts and
 * price tags, with the photo as proof, under the ODbL. Read through its
 * documented API (GET /api/v1/prices, schema at /api/schema).
 *
 * What it is: dated observations in named shops. What it is not: today's
 * price. Every record becomes a "community" price, used as history only.
 *
 * Poland only. The prices endpoint has no country filter and silently
 * ignores parameters it does not know, so the query asks for PLN and every
 * record is checked here: PLN, a physical shop whose address is in Poland,
 * not a duplicate Open Prices itself flagged. Contributor usernames are never
 * read into the app.
 *
 * Not `server-only` so the tests can import it; only server code fetches.
 */

import { z } from "zod";

import { canonicalGtin } from "../gtin.ts";
import { toGrosz } from "../money.ts";
import { retailerForOsm, type RetailerId } from "../retailers.ts";
import { RETAILER_LOYALTY, type PriceFact, type PriceType } from "../types.ts";
import { parseQuantity, type Quantity } from "../units.ts";

export const OPEN_PRICES_ORIGIN = "https://prices.openfoodfacts.org";
const PAGE_SIZE = 100;

/** One page of PLN prices, newest additions first, added on or after `since` (YYYY-MM-DD). */
export function openPricesUrl(page: number, since: string | null): string {
  const params = new URLSearchParams({
    currency: "PLN",
    order_by: "-created",
    size: String(PAGE_SIZE),
    page: String(page),
  });
  if (since) params.set("created__gte", since);
  return `${OPEN_PRICES_ORIGIN}/api/v1/prices?${params.toString()}`;
}

/** The public page of one price, with its proof: the evidence link. */
export function openPricesPage(id: number | string): string {
  return `${OPEN_PRICES_ORIGIN}/prices/${id}`;
}

/* Parsing ------------------------------------------------------------------- */

const locationSchema = z.looseObject({
  id: z.number(),
  type: z.string(),
  osm_id: z.number().nullish(),
  osm_type: z.string().nullish(),
  osm_name: z.string().nullish(),
  osm_brand: z.string().nullish(),
  osm_address_city: z.string().nullish(),
  osm_address_postcode: z.string().nullish(),
  osm_address_country_code: z.string().nullish(),
  osm_lat: z.number().nullish(),
  osm_lon: z.number().nullish(),
});

const productSchema = z.looseObject({
  code: z.string().nullish(),
  product_name: z.string().nullish(),
  brands: z.string().nullish(),
  product_quantity: z.number().nullish(),
  product_quantity_unit: z.string().nullish(),
  quantity: z.string().nullish(),
  categories_tags: z.array(z.string()).nullish(),
});

const priceSchema = z.looseObject({
  id: z.number(),
  type: z.string(),
  product_code: z.string().nullish(),
  product_name: z.string().nullish(),
  category_tag: z.string().nullish(),
  price: z.number(),
  price_is_discounted: z.boolean().nullish(),
  price_without_discount: z.number().nullish(),
  discount_type: z.string().nullish(),
  price_per: z.string().nullish(),
  currency: z.string().nullish(),
  date: z.string().nullish(),
  receipt_quantity: z.number().nullish(),
  created: z.string(),
  duplicate_of: z.number().nullish(),
  location: locationSchema.nullish(),
  proof: z.looseObject({ id: z.number(), type: z.string().nullish() }).nullish(),
  product: productSchema.nullish(),
});

const pageSchema = z.looseObject({
  items: z.array(z.unknown()),
  total: z.number().nullish(),
  pages: z.number().nullish(),
});

export type RejectReason =
  | "unreadable"
  | "currency"
  | "not_poland"
  | "online"
  | "duplicate"
  | "no_date"
  | "no_product"
  | "invalid_price"
  | "future_date";

export type OpenPricesStore = {
  recordId: string;
  name: string;
  retailer: RetailerId | null;
  city: string | null;
  postcode: string | null;
  lat: number | null;
  lon: number | null;
};

export type OpenPricesRecord = {
  /** "openprices:341363" */
  recordId: string;
  openPricesId: number;
  store: OpenPricesStore;
  /** GTIN-14, or null for a category price or an unreadable code. */
  gtin: string | null;
  productName: string;
  brand: string | null;
  pack: Quantity | null;
  categories: string[];
  amountGrosz: number;
  per: "pack" | "kg";
  priceType: PriceType;
  regularGrosz: number | null;
  discountType: string | null;
  /** YYYY-MM-DD the price was seen. */
  observedOn: string;
  createdAt: string;
  proofType: string | null;
  url: string;
};

export type ParsedPage = {
  records: OpenPricesRecord[];
  rejected: Partial<Record<RejectReason, number>>;
  pages: number;
  total: number;
};

/** Throws when the response is not an Open Prices page at all, so a changed API never reads as "no prices". */
export function parseOpenPricesPage(json: unknown, today: string): ParsedPage {
  const page = pageSchema.safeParse(json);
  if (!page.success) throw new Error("Open Prices zmieniło format odpowiedzi (brak listy cen).");
  const records: OpenPricesRecord[] = [];
  const rejected: Partial<Record<RejectReason, number>> = {};
  const reject = (reason: RejectReason) => (rejected[reason] = (rejected[reason] ?? 0) + 1);

  for (const raw of page.data.items) {
    const parsed = priceSchema.safeParse(raw);
    if (!parsed.success) {
      reject("unreadable");
      continue;
    }
    const outcome = toRecord(parsed.data, today);
    if (typeof outcome === "string") reject(outcome);
    else records.push(outcome);
  }
  if (page.data.items.length > 0 && rejected.unreadable === page.data.items.length) {
    throw new Error("Open Prices zmieniło format odpowiedzi (nie udało się odczytać żadnej ceny).");
  }
  return { records, rejected, pages: page.data.pages ?? 1, total: page.data.total ?? records.length };
}

type RawPrice = z.infer<typeof priceSchema>;

function toRecord(price: RawPrice, today: string): OpenPricesRecord | RejectReason {
  if (price.currency !== "PLN") return "currency";
  const location = price.location;
  if (!location || location.type !== "OSM") return "online";
  if (location.osm_address_country_code !== "PL") return "not_poland";
  if (price.duplicate_of != null) return "duplicate";
  if (!price.date || !/^\d{4}-\d{2}-\d{2}$/.test(price.date)) return "no_date";
  if (price.date > today) return "future_date";
  if (!(price.price > 0) || price.price > 5000) return "invalid_price";

  const product = price.product ?? null;
  const name = clean(product?.product_name ?? price.product_name ?? "");
  if (!name) return "no_product";
  const brand = clean(product?.brands?.split(",")[0] ?? "") || null;
  const pack = packOf(product);
  const retailer = retailerForOsm(location.osm_brand, location.osm_name);
  const discount = price.discount_type ?? null;
  const priceType: PriceType = !price.price_is_discounted
    ? "regular"
    : discount === "LOYALTY_PROGRAM"
      ? "loyalty"
      : discount === "QUANTITY"
        ? "multibuy"
        : discount === "EXPIRES_SOON"
          ? "clearance"
          : "promotion";

  return {
    recordId: `openprices:${price.id}`,
    openPricesId: price.id,
    store: {
      recordId: `osm:${location.osm_type ?? "NODE"}:${location.osm_id ?? location.id}`,
      name: clean(location.osm_name ?? location.osm_brand ?? "Sklep"),
      retailer: retailer?.id ?? null,
      city: location.osm_address_city ?? null,
      postcode: location.osm_address_postcode ?? null,
      lat: location.osm_lat ?? null,
      lon: location.osm_lon ?? null,
    },
    gtin: price.product_code ? canonicalGtin(price.product_code) : null,
    productName: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}` : name,
    brand,
    pack,
    categories: product?.categories_tags ?? [],
    amountGrosz: toGrosz(price.price),
    per: price.price_per === "KILOGRAM" ? "kg" : "pack",
    priceType,
    regularGrosz: price.price_without_discount && price.price_without_discount > price.price ? toGrosz(price.price_without_discount) : null,
    discountType: discount,
    observedOn: price.date,
    createdAt: price.created,
    proofType: price.proof?.type ?? null,
    url: openPricesPage(price.id),
  };
}

/** The pack Open Food Facts gives, else one read from its quantity text. */
function packOf(product: z.infer<typeof productSchema> | null): Quantity | null {
  if (!product) return null;
  const amount = product.product_quantity;
  const unit = product.product_quantity_unit?.toLowerCase();
  if (amount && amount > 0 && (unit === "g" || unit === "ml")) return { amount, unit };
  return product.quantity ? parseQuantity(product.quantity) : null;
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A record as a price fact for the eligibility engine: a community observation in one shop. */
export function openPricesFact(record: OpenPricesRecord): PriceFact {
  const retailer = record.store.retailer;
  return {
    providerId: "open-prices",
    retailer,
    productName: record.productName,
    amountGrosz: record.amountGrosz,
    currency: "PLN",
    per: record.per,
    pack: record.per === "kg" ? { amount: 1000, unit: "g" } : record.pack,
    loose: record.per === "kg",
    priceType: record.priceType,
    regularGrosz: record.regularGrosz,
    kind: "community",
    observedAt: `${record.observedOn}T12:00:00Z`,
    validFrom: null,
    validTo: null,
    conditions: {
      loyaltyProgram: record.priceType === "loyalty" && retailer ? (RETAILER_LOYALTY[retailer] ?? null) : null,
      appOnly: record.priceType === "loyalty",
      minQuantity: 1,
      multibuy: record.priceType === "multibuy" ? "promocja ilościowa" : null,
      quantityLimit: null,
      depositGrosz: 0,
      text: record.discountType ? `Open Prices: ${record.discountType}` : "",
    },
    evidence: { type: record.proofType === "PRICE_TAG" ? "price_tag" : "receipt", url: record.url, recordId: record.recordId },
    region: { channel: "store", national: false, city: record.store.city, deliveryTowns: null },
    availability: "unknown",
    derived: false,
  };
}

/* Fetching ------------------------------------------------------------------ */

/**
 * Pages of PLN prices added since `since`, read one after another (the API
 * documents no rate limit, so it is read gently: one request at a time, at
 * most `maxPages`). A failed page stops the read; what was read is returned.
 */
export async function fetchOpenPrices(
  since: string | null,
  today: string,
  options: { maxPages?: number; userAgent: string },
): Promise<ParsedPage & { pagesRead: number; error: string | null }> {
  const maxPages = options.maxPages ?? 30;
  const result: ParsedPage & { pagesRead: number; error: string | null } = {
    records: [],
    rejected: {},
    pages: 1,
    total: 0,
    pagesRead: 0,
    error: null,
  };
  for (let page = 1; page <= Math.min(result.pages, maxPages); page++) {
    let json: unknown;
    try {
      const response = await fetch(openPricesUrl(page, since), {
        headers: { "user-agent": options.userAgent, accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Open Prices odpowiedziało błędem ${response.status}.`);
      json = await response.json();
    } catch (error) {
      result.error = error instanceof Error ? error.message : "Nie udało się połączyć z Open Prices.";
      break;
    }
    const parsed = parseOpenPricesPage(json, today);
    result.records.push(...parsed.records);
    for (const [reason, count] of Object.entries(parsed.rejected)) {
      result.rejected[reason as RejectReason] = (result.rejected[reason as RejectReason] ?? 0) + (count ?? 0);
    }
    result.pages = parsed.pages;
    result.total = parsed.total;
    result.pagesRead++;
  }
  return result;
}
