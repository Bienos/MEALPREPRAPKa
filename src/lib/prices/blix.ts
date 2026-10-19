/**
 * Blix adapter: this week's leaflet offers from the other chains.
 *
 * blix.pl collects every chain's leaflets. Its product pages load offers as
 * JSON (`?async=1`), filtered by text (`q`, a case-insensitive substring of
 * the offer name, Polish letters required) and by shop (`bids[]`). One request
 * per page (at most two per shopping-list item that has a search term), only when
 * I tap "Sprawdź promocje". robots.txt allows these paths; keep it on-tap and
 * low-volume.
 *
 * A leaflet offer says neither the pack size nor what the price is for (per
 * kilo, per 100 g, per pack), so it is only ever a "pasuje?" suggestion and
 * the pack is asked once when I confirm it. Validity comes as a label
 * ("aktualna", "ostatnie 24h", "już za 2 dni"), not dates.
 *
 * Not `server-only` so the tests can import it; only server code uses it.
 */

import { z } from "zod";

import { addDays, toIsoDate } from "../date.ts";
import { parsePack, shopPromoSchema } from "./promo.ts";
import type { Shop, ShopPromo } from "./types.ts";

const ORIGIN = "https://blix.pl";

/** Blix's shop ids for the chains priced here. Lidl comes from lidl.pl, which says more. */
export const BLIX_SHOPS: Record<number, Shop> = {
  23: "biedronka",
  46: "kaufland",
  66: "aldi",
  51: "netto",
  71: "dino",
  31: "carrefour",
  47: "auchan",
  161: "stokrotka",
};

/** Where to look for one shopping item: a grocery subcategory (or none) and a text filter. */
export type BlixSearch = { sub: string; q: string };

/** Leaflets run about a week; an offer with no stated end is kept that long. */
const ASSUMED_DAYS = 6;
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** A search reads at most this many pages (24 offers each): enough for one item, still gentle. */
const MAX_PAGES = 2;
/** Searches in flight at once. */
const PARALLEL = 3;

export function blixUrl(search: BlixSearch, page = 1): string {
  const params = new URLSearchParams({ async: "1", page: String(page) });
  if (search.q) params.set("q", search.q.toLowerCase());
  Object.keys(BLIX_SHOPS).forEach((id, index) => params.set(`bids[${index}]`, id));
  const path = ["produkty", "artykuly-spozywcze", search.sub].filter(Boolean).join("/");
  return `${ORIGIN}/${path}?${params.toString()}`;
}

export type BlixResult = {
  promos: ShopPromo[];
  searched: number;
  failed: number;
};

/**
 * Fetches each search (a few at a time; a second page only when there is
 * one) and parses the offers. A search that fails is counted and skipped;
 * when all of them fail, the error is thrown so last week's offers stay.
 */
export async function fetchBlixPromos(searches: BlixSearch[], now: Date = new Date()): Promise<BlixResult> {
  const unique = [...new Map(searches.map((search) => [blixUrl(search), search])).values()];
  const results: ShopPromo[][] = [];
  let failures = 0;
  let lastError: unknown = null;
  for (let index = 0; index < unique.length; index += PARALLEL) {
    const batch = await Promise.allSettled(
      unique.slice(index, index + PARALLEL).map((search) => fetchSearch(search, now)),
    );
    for (const result of batch) {
      if (result.status === "fulfilled") results.push(result.value);
      else {
        failures++;
        lastError = result.reason;
      }
    }
  }
  if (unique.length > 0 && failures === unique.length) {
    throw lastError instanceof Error ? lastError : new Error("Nie udało się pobrać gazetek z Blix.");
  }
  return {
    promos: dedupe(results.flat()),
    searched: unique.length,
    failed: failures,
  };
}

async function fetchSearch(search: BlixSearch, now: Date): Promise<ShopPromo[]> {
  const first = await fetchPage(blixUrl(search, 1));
  const promos = parseBlixPromos(first, now);
  const pages = pageCountOf(first);
  for (let page = 2; page <= Math.min(pages, MAX_PAGES); page++) {
    promos.push(...parseBlixPromos(await fetchPage(blixUrl(search, page)), now));
  }
  return promos;
}

async function fetchPage(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json, */*",
        "accept-language": "pl-PL,pl;q=0.9",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Nie udało się połączyć z blix.pl. Spróbuj za chwilę.");
  }
  if (response.status === 403 || response.status === 429 || response.status === 503) {
    throw new Error(`Blix chwilowo odrzucił zapytanie (${response.status}). Spróbuj za kilka minut.`);
  }
  if (!response.ok) throw new Error(`blix.pl odpowiedział błędem ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new Error("Blix zmienił format odpowiedzi (to nie jest JSON).");
  }
}

function pageCountOf(json: unknown): number {
  const count = (json as { pageCount?: unknown } | null)?.pageCount;
  return typeof count === "number" && Number.isFinite(count) ? count : 1;
}

/* Parsing ------------------------------------------------------------------- */

const offerSchema = z.looseObject({
  offerName: z.string(),
  brandId: z.number(),
  price: z.string().nullish(),
  leafletPage: z.looseObject({ leafletId: z.number(), page: z.number() }).nullish(),
  availabilityLabel: z.looseObject({ message: z.string().nullish(), class: z.string().nullish() }).nullish(),
});

const responseSchema = z.looseObject({
  offers: z.array(z.unknown()),
  availableBrands: z.array(z.looseObject({ id: z.number(), name: z.string(), slug: z.string() })).default([]),
});

/**
 * Turns one Blix response into promotions for the chains in BLIX_SHOPS.
 * Offers with no price, from other chains, or already over are left out.
 * Throws when the response no longer looks like Blix's.
 */
export function parseBlixPromos(json: unknown, now: Date = new Date()): ShopPromo[] {
  const response = responseSchema.safeParse(json);
  if (!response.success) throw new Error("Blix zmienił format odpowiedzi (brak listy ofert).");
  const brands = new Map(response.data.availableBrands.map((brand) => [brand.id, brand]));
  const today = toIsoDate(now);

  const promos: ShopPromo[] = [];
  let readable = 0;
  for (const raw of response.data.offers) {
    const offer = offerSchema.safeParse(raw);
    if (!offer.success) continue;
    readable++;
    const { offerName, brandId, price, leafletPage, availabilityLabel } = offer.data;
    const shop = BLIX_SHOPS[brandId];
    const amount = parsePrice(price ?? "");
    const validity = validityOf(availabilityLabel?.class ?? "", availabilityLabel?.message ?? "", today);
    if (!shop || amount === null || !validity) continue;

    const name = offerName.replace(/\s+/g, " ").trim();
    // "4-pak 150 g" does not say whether 150 g is one bag or all four: ask instead.
    const pack = /\d\s*-?\s*pak\b/i.test(name) ? null : parsePack(name);
    const brand = brands.get(brandId);
    promos.push(
      shopPromoSchema.parse({
        shop,
        productKey: `blix:${foldName(name)}`,
        name,
        packQuantity: pack?.quantity ?? null,
        packUnit: pack?.unit ?? null,
        loose: false,
        promoPrice: amount,
        regularPrice: null,
        ...validity,
        conditions: `Gazetka ${brand?.name ?? shop}${availabilityLabel?.message ? ` · ${availabilityLabel.message}` : ""}`,
        appOnly: false,
        multibuy: null,
        multibuyMin: 1,
        sourceUrl:
          brand && leafletPage
            ? `${ORIGIN}/sklep/${brand.slug}/gazetka/${leafletPage.leafletId}/?pageNumber=${leafletPage.page + 1}`
            : ORIGIN,
      }),
    );
  }
  if (response.data.offers.length > 0 && readable === 0) {
    throw new Error("Blix zmienił format odpowiedzi (nie udało się odczytać żadnej oferty).");
  }
  return dedupe(promos);
}

/** "14,99zł" -> 14.99; "" -> null. */
function parsePrice(text: string): number | null {
  const match = text.match(/(\d+)[,.](\d{2})/);
  return match ? Number(`${match[1]}.${match[2]}`) : null;
}

/** The availability label as dates: valid now for about a leaflet's week, ending today, or starting in N days. */
function validityOf(cssClass: string, message: string, today: string): { validFrom: string; validTo: string } | null {
  if (cssClass === "lav-available" || cssClass === "lav-new")
    return { validFrom: today, validTo: addDays(today, ASSUMED_DAYS) };
  if (cssClass === "lav-ending-soon") return { validFrom: today, validTo: today };
  if (cssClass === "lav-starting-soon") {
    const days = /jutr/i.test(message) ? 1 : Number(message.match(/(\d+)/)?.[1] ?? 1);
    const from = addDays(today, days);
    return { validFrom: from, validTo: addDays(from, ASSUMED_DAYS) };
  }
  return null;
}

/** The same offer comes from several leaflet versions; keep one per shop and name, at its lowest price. */
function dedupe(promos: ShopPromo[]): ShopPromo[] {
  const byKey = new Map<string, ShopPromo>();
  for (const promo of promos) {
    const key = `${promo.shop}|${promo.productKey}`;
    const existing = byKey.get(key);
    if (!existing || promo.promoPrice < existing.promoPrice) byKey.set(key, promo);
  }
  return [...byKey.values()];
}

/** Lowercase ASCII with single spaces: the key a confirmed offer is remembered by. */
function foldName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}
