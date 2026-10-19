/**
 * Lidl adapter: this week's food promotions from lidl.pl.
 *
 * There is no public API. lidl.pl's own pages load their product tiles from a
 * JSON search endpoint, and that endpoint answers a plain request, so one
 * request returns every food item the site currently shows (~30 promos on a
 * Monday: the Monday-Wednesday deals plus the week-long ones; Thursday's
 * appear on Thursday). Deals that exist only in the PDF leaflet or as banner
 * images are not in it.
 *
 * Each item carries a price block per price region; Poland is one region.
 * A promotion sits in `currentPrice` (anyone) or `currentLidlPlusPrice`
 * (activate the coupon in the Lidl Plus app). Parsing is pure and tested
 * against a saved response in ./fixtures.
 *
 * Not `server-only` so the tests can import it; only server code uses it.
 */

import { z } from "zod";

import { toIsoDate } from "../date.ts";
import { parsePack, shopPromoSchema } from "./promo.ts";
import type { ShopPromo } from "./types.ts";

const ORIGIN = "https://www.lidl.pl";
/** The "Żywność i napoje" category of lidl.pl's search, every item in one page (fetchsize). */
export const LIDL_PROMOS_URL =
  "https://www.lidl.pl/q/api/search?assortment=PL&locale=pl_PL&version=v2.0.0" +
  "&category=%C5%BBywno%C5%9B%C4%87+i+napoje&fetchsize=1000";

const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** One request, made only when I tap "Sprawdź promocje". */
export async function fetchLidlPromos(now: Date = new Date()): Promise<ShopPromo[]> {
  let response: Response;
  try {
    response = await fetch(LIDL_PROMOS_URL, {
      headers: { "user-agent": USER_AGENT, accept: "*/*", "accept-language": "pl-PL,pl;q=0.9" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Nie udało się połączyć z lidl.pl. Spróbuj za chwilę.");
  }
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    // lidl.pl sits behind bot protection that now and then turns a plain request away.
    throw new Error(`Lidl chwilowo odrzucił zapytanie (${response.status}). Spróbuj za kilka minut.`);
  }
  if (!response.ok) throw new Error(`lidl.pl odpowiedział błędem ${response.status}.`);
  return parseLidlPromos(await response.json(), now);
}

/* Parsing ------------------------------------------------------------------- */

const priceBlockSchema = z.looseObject({
  price: z.number(),
  oldPrice: z.number().nullish(),
  prefix: z.string().nullish(),
  packaging: z.looseObject({ text: z.string() }).nullish(),
  basePrice: z.looseObject({ text: z.string() }).nullish(),
  discount: z.looseObject({ deletedPrice: z.number().nullish(), discountText: z.string().nullish() }).nullish(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
});
type PriceBlock = z.infer<typeof priceBlockSchema>;

const itemSchema = z.looseObject({
  gridbox: z.looseObject({
    data: z.looseObject({
      productId: z.union([z.number(), z.string()]),
      fullTitle: z.string(),
      title: z.string().nullish(),
      brand: z.looseObject({ name: z.string().nullish() }).nullish(),
      canonicalUrl: z.string().nullish(),
      ageRestriction: z.boolean().nullish(),
      storeStartDate: z.number().nullish(),
      storeEndDate: z.number().nullish(),
      regionsPrices: z
        .record(
          z.string(),
          z.looseObject({
            currentPrice: priceBlockSchema.nullish(),
            currentLidlPlusPrice: z.looseObject({ price: priceBlockSchema, highlightText: z.string().nullish() }).nullish(),
          }),
        )
        .nullish(),
    }),
  }),
});

const responseSchema = z.looseObject({ items: z.array(z.unknown()) });

/**
 * Turns a search response into promotions. Items that are not promotions
 * (no price block, alcohol, nothing discounted) are left out. Throws when the
 * response no longer looks like Lidl's, so a site change never silently
 * replaces this week's promos with nothing.
 */
export function parseLidlPromos(json: unknown, now: Date = new Date()): ShopPromo[] {
  const response = responseSchema.safeParse(json);
  if (!response.success) throw new Error("Lidl zmienił format odpowiedzi (brak listy produktów).");

  const promos = new Map<string, ShopPromo>();
  let readable = 0;
  for (const raw of response.data.items) {
    const item = itemSchema.safeParse(raw);
    if (!item.success) continue;
    readable++;
    const promo = toPromo(item.data.gridbox.data, now);
    if (promo && !promos.has(promo.productKey)) promos.set(promo.productKey, shopPromoSchema.parse(promo));
  }
  if (response.data.items.length > 0 && readable === 0) {
    throw new Error("Lidl zmienił format odpowiedzi (nie udało się odczytać żadnego produktu).");
  }
  return [...promos.values()];
}

type ItemData = z.infer<typeof itemSchema>["gridbox"]["data"];

function toPromo(data: ItemData, now: Date): ShopPromo | null {
  if (data.ageRestriction) return null;
  const regions = data.regionsPrices ?? {};
  // Poland is one price region ("1"); take the first if Lidl ever renumbers it.
  const region = regions["1"] ?? Object.values(regions)[0];
  if (!region) return null;

  // With the app the Lidl Plus deal is the one I get, so it wins when both exist.
  const app = region.currentLidlPlusPrice ?? null;
  const block = app?.price ?? region.currentPrice;
  if (!block) return null;
  const conditions = clean(block.basePrice?.text ?? "");
  if (/alkoholu nie sprzedajemy/i.test(conditions)) return null;

  const label = clean(app?.highlightText ?? block.discount?.discountText ?? "") || null;
  const terms = promoTerms(block, label, conditions);
  if (!terms) return null;

  const title = clean(data.title || data.fullTitle).replace(/^[-–\s]+/, "");
  const brand = clean(data.brand?.name ?? "");
  const name = brand && !title.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${title}` : title;
  const pack = parsePack(block.packaging?.text ?? "");

  const validFrom = data.storeStartDate
    ? toIsoDate(new Date(data.storeStartDate * 1000))
    : block.startDate
      ? toIsoDate(new Date(block.startDate))
      : toIsoDate(now);
  const validTo = data.storeEndDate
    ? toIsoDate(new Date(data.storeEndDate * 1000))
    : block.endDate
      ? toIsoDate(new Date(block.endDate))
      : null;
  if (validTo !== null && validTo < toIsoDate(now)) return null;

  return {
    shop: "lidl",
    productKey: `lidl:${data.productId}`,
    name,
    packQuantity: pack?.quantity ?? null,
    packUnit: pack?.unit ?? null,
    loose: /\bluzem\b/i.test(title),
    ...terms,
    validFrom,
    validTo: validTo && validTo < validFrom ? validFrom : validTo,
    conditions,
    appOnly: app !== null,
    sourceUrl: data.canonicalUrl ? new URL(data.canonicalUrl, ORIGIN).toString() : ORIGIN,
  };
}

type Terms = Pick<ShopPromo, "promoPrice" | "regularPrice" | "multibuy" | "multibuyMin">;

/**
 * What the deal is. Lidl shows four kinds:
 * - "1+1 gratis" / "2+1 gratis": the shown price is the normal one, so the
 *   per-pack price is read from the fine print or worked out from the ratio;
 * - "-50% przy zakupie 2": the shown price applies per pack from the 2nd pack;
 * - "-33%": a plain cut, old price struck through;
 * - "Supercena", "Aż 30 szt.": a special price with nothing struck through.
 */
function promoTerms(block: PriceBlock, label: string | null, conditions: string): Terms | null {
  const shown = block.price;
  const shownIsRegular = /poza promocj/i.test(block.prefix ?? "");
  const old = block.oldPrice ?? block.discount?.deletedPrice ?? null;

  const gratis = label?.match(/(\d+)\s*\+\s*(\d+)\s*gratis/i);
  if (gratis) {
    const paid = Number(gratis[1]);
    const total = paid + Number(gratis[2]);
    const regular = shownIsRegular ? shown : (old ?? shown);
    const perPack = explicitMultibuyPrice(conditions) ?? floorToGrosz((regular * paid) / total);
    return { promoPrice: perPack, regularPrice: regular, multibuy: label, multibuyMin: total };
  }

  const buyN = label?.match(/przy\s+zakup\S*\s+(\d+)/i);
  if (buyN) {
    return {
      promoPrice: shown,
      regularPrice: old ?? regularFromText(conditions),
      multibuy: label,
      multibuyMin: Math.max(1, Number(buyN[1])),
    };
  }

  if (old !== null && old > shown) return { promoPrice: shown, regularPrice: old, multibuy: null, multibuyMin: 1 };
  if (label && !shownIsRegular) return { promoPrice: shown, regularPrice: null, multibuy: null, multibuyMin: 1 };
  return null;
}

/** "Cena za 1 opak. przy zakupie 2 opak. lub wielokrotności 2 opak.: 5,49/opak." -> 5.49 */
function explicitMultibuyPrice(text: string): number | null {
  const match = text.match(/przy zakupie \d+ \S+(?: lub wielokrotno\S+ \d+ \S+)?:\s*(\d+,\d{2})/i);
  return match ? toNumber(match[1]) : null;
}

/** "cena przed obniżką/cena poza promocją: 9,99/opak." or "...: 1 kg = 6,99" -> the number. */
function regularFromText(text: string): number | null {
  const match = text.match(/cena (?:przed obniżką|poza promocją)[^:]*:\s*(?:\d+(?:,\d+)? ?(?:kg|g|l|ml|szt\.?) = )?(\d+,\d{2})/i);
  return match ? toNumber(match[1]) : null;
}

function toNumber(value: string): number {
  return Number(value.replace(",", "."));
}

function floorToGrosz(value: number): number {
  return Math.floor(value * 100 + 1e-6) / 100;
}

/** Collapses Lidl's non-breaking spaces and runs of whitespace. */
function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
