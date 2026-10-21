/**
 * Online grocery delivery, compared on the same basket as the shops: which
 * online shop delivers here, what the basket costs there, what the delivery
 * adds, and whether the order is big enough. Pure and client-safe.
 *
 * Fees are never invented. Each provider carries what its own delivery page
 * said on the day noted (an estimate, with the link), or nothing; the person
 * can type the fee they saw at checkout, which then counts as confirmed.
 */

import type { BasketSummary, ShopBasket } from "./basket.ts";
import type { Shop } from "./types.ts";

export type Provider = {
  id: string;
  label: string;
  /** The shop whose prices this provider delivers; null when it shows no prices without an address. */
  shop: Shop | null;
  url: string;
  /** Towns it delivers to; "all" for the whole country (courier). Checked against the shopping town. */
  cities: readonly string[] | "all";
  /** What the provider's own delivery page said, with where and when it was read. */
  published: {
    minOrder: number | null;
    fee: number | null;
    freeAbove: number | null;
    /** Fee unknown from the page ("zależy od terminu"): the person has to type it. */
    note: string;
    source: string;
    day: string;
  } | null;
};

export const PROVIDERS: Provider[] = [
  {
    id: "frisco",
    label: "Frisco",
    shop: "frisco",
    url: "https://www.frisco.pl/",
    cities: ["Warszawa", "Kraków", "Wrocław", "Poznań", "Gdańsk", "Gdynia", "Sopot", "Łódź", "Katowice"],
    published: {
      minOrder: 100,
      fee: 14,
      freeAbove: 300,
      note: "Frisco Van: 14 zł od 100 do 300 zł, darmowa powyżej 300 zł; zależy od metody płatności.",
      source: "https://www.frisco.pl/stn,dostawa",
      day: "2026-10-20",
    },
  },
  {
    id: "auchan",
    label: "Auchan online",
    shop: "auchan",
    url: "https://zakupy.auchan.pl/",
    cities: ["Warszawa", "Kraków", "Wrocław", "Poznań", "Gdańsk", "Łódź", "Katowice", "Lublin", "Białystok"],
    published: {
      minOrder: 100,
      fee: null,
      freeAbove: null,
      note: "Minimum 100 zł. Koszt dostawy zależy od formy i terminu, widać go przy zamówieniu.",
      source: "https://zakupy.auchan.pl/faq",
      day: "2026-10-20",
    },
  },
  {
    id: "biedronka",
    label: "Biedronka online",
    shop: "biedronka",
    url: "https://zakupy.biedronka.pl/",
    cities: ["Warszawa", "Kraków", "Wrocław", "Poznań", "Gdańsk", "Łódź"],
    published: null,
  },
  {
    id: "stokrotka",
    label: "Stokrotka online",
    shop: "stokrotka",
    url: "https://sklep.stokrotka.pl/",
    cities: ["Lublin", "Warszawa", "Rzeszów", "Kielce", "Radom", "Białystok"],
    published: null,
  },
  {
    id: "lisek",
    label: "Lisek",
    shop: null,
    url: "https://lisek.app/",
    cities: ["Warszawa", "Kraków", "Wrocław", "Poznań", "Gdańsk", "Łódź"],
    published: {
      minOrder: null,
      fee: null,
      freeAbove: 120,
      note: "Darmowa dostawa od 120 zł. Ceny widać dopiero po podaniu adresu w aplikacji.",
      source: "https://lisek.app/",
      day: "2026-10-20",
    },
  },
  { id: "glovo", label: "Glovo", shop: null, url: "https://glovoapp.com/pl/pl/", cities: "all", published: null },
  { id: "wolt", label: "Wolt", shop: null, url: "https://wolt.com/pl/pol", cities: "all", published: null },
];

/**
 * What the app can hand over to a provider, level by level: 1 links to its
 * product pages, 2 the shopping list to copy, 3 filling its basket, 4 placing
 * the order. Levels 3 and 4 need a documented API or the provider's
 * permission; no provider here has either, so they are off everywhere and
 * the screen says so rather than pretending.
 */
export type Handoff = { productLinks: boolean; listCopy: boolean; basket: false; checkout: false };

export function handoffFor(provider: Provider): Handoff {
  // Product pages exist where we read the shop's own catalogue (each price links to its page).
  return { productLinks: provider.shop !== null, listCopy: true, basket: false, checkout: false };
}

export function handoffLabel(handoff: Handoff): string {
  return [
    handoff.productLinks ? "linki do produktów" : null,
    handoff.listCopy ? "lista do skopiowania" : null,
    "koszyk i zamówienie: brak udokumentowanego API, robisz to w sklepie",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The fee as I know it: what I typed (confirmed or not) or what the provider's page says. */
export type DeliveryQuote = {
  provider: string;
  fee: number | null;
  freeAbove: number | null;
  minOrder: number | null;
  /** Seen at checkout, not read off a page. */
  confirmed: boolean;
  note: string;
};

export type OnlineOption = {
  provider: Provider;
  basket: ShopBasket | null;
  /** Delivers to the shopping town. */
  available: boolean;
  /** The basket, without delivery; null when the provider shows no prices or priced nothing. */
  goods: number | null;
  fee: number | null;
  /** goods + fee, when both are known. */
  total: number | null;
  feeStatus: "confirmed" | "estimate" | "unknown";
  minOrder: number | null;
  /** The basket is under the provider's minimum. */
  belowMinimum: boolean;
  /** Priced lines over all lines; 0 when there is no basket. */
  coverage: number;
  missing: number;
  note: string;
};

/** A provider is compared only when it prices at least this share of the list. */
export const ONLINE_COVERAGE = 0.5;

function deliversTo(provider: Provider, city: string): boolean {
  if (provider.cities === "all") return true;
  const wanted = city.trim().toLowerCase();
  return provider.cities.some((name) => name.toLowerCase() === wanted);
}

/** The delivery fee for a basket of this value: the typed quote first, else the published one. */
export function feeFor(
  provider: Provider,
  quote: DeliveryQuote | undefined,
  goods: number | null,
): { fee: number | null; status: OnlineOption["feeStatus"]; minOrder: number | null; note: string } {
  const source = quote ?? (provider.published ? { ...provider.published, confirmed: false } : null);
  if (!source) return { fee: null, status: "unknown", minOrder: null, note: "Koszt dostawy nieznany, wpisz go." };
  const status: OnlineOption["feeStatus"] = quote?.confirmed ? "confirmed" : "estimate";
  if (source.fee === null) return { fee: null, status: "unknown", minOrder: source.minOrder, note: source.note };
  const fee = goods !== null && source.freeAbove !== null && goods >= source.freeAbove ? 0 : source.fee;
  return { fee, status, minOrder: source.minOrder, note: source.note };
}

/** Every provider for this town, with the basket it would deliver and what the delivery adds. */
export function onlineOptions(summary: BasketSummary, quotes: DeliveryQuote[], city: string): OnlineOption[] {
  return PROVIDERS.map((provider) => {
    const basket = provider.shop ? (summary.shops.find((one) => one.shop === provider.shop) ?? null) : null;
    const coverage = basket && summary.itemCount > 0 ? basket.priced / summary.itemCount : 0;
    const goods = basket && basket.priced > 0 ? basket.total : null;
    const quote = quotes.find((one) => one.provider === provider.id);
    const { fee, status, minOrder, note } = feeFor(provider, quote, goods);
    return {
      provider,
      basket,
      available: deliversTo(provider, city),
      goods,
      fee,
      total: goods !== null && fee !== null ? round(goods + fee) : null,
      feeStatus: status,
      minOrder,
      belowMinimum: goods !== null && minOrder !== null && goods < minOrder,
      coverage,
      missing: basket ? summary.itemCount - basket.priced : summary.itemCount,
      note,
    };
  });
}

export type BestOption =
  | {
      kind: "shop";
      shop: Shop;
      total: number;
      coverage: number;
      missing: number;
      estimated: number;
      /** Every item priced. Without it the total is partial and must never read as "the cheapest basket". */
      complete: boolean;
    }
  | { kind: "online"; option: OnlineOption }
  | { kind: "split"; total: number; savings: number; count: number };

/**
 * The three answers to "gdzie najtaniej?": the cheapest shop that prices
 * enough of the list (complete enough, never the one with three prices), the
 * cheapest delivery with its fee, and the split between shops when it saves
 * something. Totals are of what each one prices; the missing count says the rest.
 */
export function bestOptions(
  summary: BasketSummary,
  online: OnlineOption[],
): { shop: BestOption | null; online: BestOption | null; split: BestOption | null } {
  const complete = summary.shops
    .filter((basket) => summary.itemCount > 0 && basket.priced / summary.itemCount >= ONLINE_COVERAGE)
    .sort((a, b) => b.priced - a.priced || a.total - b.total);
  const fullest = complete[0]?.priced ?? 0;
  const shop = complete.filter((basket) => basket.priced === fullest).sort((a, b) => a.total - b.total)[0] ?? null;
  const delivered = online
    .filter((one) => one.available && one.total !== null && one.coverage >= ONLINE_COVERAGE && !one.belowMinimum)
    .sort((a, b) => b.coverage - a.coverage || a.total! - b.total!);
  const bestOnline = delivered.filter((one) => one.coverage === delivered[0]?.coverage)[0] ?? null;
  return {
    shop: shop
      ? {
          kind: "shop",
          shop: shop.shop,
          total: shop.total,
          coverage: shop.priced / summary.itemCount,
          missing: summary.itemCount - shop.priced,
          estimated: shop.estimated,
          complete: shop.priced === summary.itemCount,
        }
      : null,
    online: bestOnline ? { kind: "online", option: bestOnline } : null,
    split: summary.split
      ? { kind: "split", total: summary.split.total, savings: summary.split.savings, count: summary.compared.count }
      : null,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
