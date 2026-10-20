/**
 * "Promocje tygodnia": the leaflet and app deals of every shop, filtered and
 * ordered for one screen. Pure, so the page stays a thin layer over it.
 */

import type { Unit } from "../meals/ingredients.ts";
import { fold, matchPromos } from "./match.ts";
import { SHOPS, type ProductLink, type Shop, type ShopPromo } from "./types.ts";

/** The loyalty app that unlocks some of a shop's deals. */
export const APP_LABEL: Partial<Record<Shop, string>> = {
  lidl: "Lidl Plus",
  biedronka: "Moja Biedronka",
  zabka: "Żappka",
  kaufland: "Kaufland Card",
  carrefour: "Mój Carrefour",
  auchan: "Skarbonka",
  stokrotka: "Stokrotka",
  netto: "Netto",
  dino: "Dino",
  aldi: "Aldi",
  leclerc: "Leclerc",
};

export type DealWhen = "now" | "soon";

export type DealQuery = {
  today: string;
  /** All shops when null. */
  shop: Shop | null;
  /** Words from the search box; every one must be in the name. */
  search: string;
  /** Only the deals that could be an item on the shopping list. */
  mineOnly: boolean;
  when: DealWhen;
};

/** The discount in percent against the regular price, when the shop gave one. */
export function discountPercent(promo: Pick<ShopPromo, "promoPrice" | "regularPrice">): number | null {
  if (promo.regularPrice === null || promo.regularPrice <= promo.promoPrice) return null;
  return Math.round((1 - promo.promoPrice / promo.regularPrice) * 100);
}

/** "12,99 zł/kg" for a pack in grams or millilitres, "1,20 zł/szt." for pieces; null when the pack is not known. */
export function unitPriceLabel(
  promo: Pick<ShopPromo, "promoPrice" | "packQuantity" | "packUnit" | "loose">,
): string | null {
  // Sold by weight with no weight given: the price is per kilo.
  if (promo.loose && !promo.packQuantity) return `${money(promo.promoPrice)}/kg`;
  if (!promo.packQuantity || !promo.packUnit) return null;
  if (promo.packUnit === "szt") {
    return promo.packQuantity > 1 ? `${money(promo.promoPrice / promo.packQuantity)}/szt.` : null;
  }
  const per = (promo.promoPrice / promo.packQuantity) * 1000;
  return `${money(per)}/${promo.packUnit === "g" ? "kg" : "l"}`;
}

export function money(value: number): string {
  return `${value.toFixed(2).replace(".", ",")} zł`;
}

/** "25.10" from "2026-10-25". */
export function dayLabel(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

/**
 * The deals to show: valid now or starting later, for one shop or all, those
 * naming every search word, those on my list first when asked. Best discount
 * first, then the cheapest per kilo.
 */
export function selectDeals(promos: ShopPromo[], query: DealQuery, mine: Set<string>): ShopPromo[] {
  const words = fold(query.search).split(/\s+/).filter(Boolean);
  const id = (promo: ShopPromo) => `${promo.shop}|${promo.productKey}`;
  return promos
    .filter((promo) => (promo.validTo === null || promo.validTo >= query.today) && !promo.shelf)
    .filter((promo) => (query.when === "now" ? promo.validFrom <= query.today : promo.validFrom > query.today))
    .filter((promo) => query.shop === null || promo.shop === query.shop)
    .filter((promo) => !query.mineOnly || mine.has(id(promo)))
    .filter((promo) => words.every((word) => fold(promo.name).includes(word)))
    .sort(
      (a, b) =>
        Number(mine.has(id(b))) - Number(mine.has(id(a))) ||
        (discountPercent(b) ?? -1) - (discountPercent(a) ?? -1) ||
        a.promoPrice - b.promoPrice,
    );
}

/** How many deals each shop has under this query, so the shop chips can show it. */
export function countByShop(promos: ShopPromo[], query: DealQuery, mine: Set<string>): Record<Shop, number> {
  const counts = Object.fromEntries(SHOPS.map((shop) => [shop, 0])) as Record<Shop, number>;
  for (const promo of selectDeals(promos, { ...query, shop: null }, mine)) counts[promo.shop]++;
  return counts;
}

/* What is worth buying now -------------------------------------------------- */

/** The staples this diet is built on: always shown when they are on offer, listed or not. */
export const WATCHED: { label: string; item: string; unit: Unit }[] = [
  { label: "Kurczak", item: "kurczak", unit: "g" },
  { label: "Indyk", item: "indyk", unit: "g" },
  { label: "Wołowina", item: "wołowina", unit: "g" },
  { label: "Wieprzowina", item: "wieprzowina", unit: "g" },
  { label: "Mięso mielone", item: "mięso mielone", unit: "g" },
  { label: "Łosoś", item: "łosoś", unit: "g" },
  { label: "Skyr", item: "skyr", unit: "g" },
  { label: "Serek wiejski", item: "serek wiejski", unit: "g" },
  { label: "Twaróg", item: "twaróg", unit: "g" },
  { label: "Jogurt", item: "jogurt naturalny", unit: "g" },
  { label: "Jajka", item: "jajka", unit: "szt" },
  { label: "Owoce mrożone", item: "owoce mrożone", unit: "g" },
  { label: "Jabłka", item: "jabłko", unit: "g" },
  { label: "Banany", item: "banan", unit: "g" },
];

export type Highlight = {
  promo: ShopPromo;
  /** The offer named no pack, so the usual one was assumed to compare it. */
  assumed: boolean;
};

export type HighlightGroup = { label: string; item: string; deals: Highlight[] };

/** Price per kilo, litre or piece, to compare offers of one staple. */
export function perUnitValue(promo: ShopPromo): number {
  // A loose price is for the weight given (Frisco's "(400g-600g)" is 14,99 zł for 500 g), or a kilo when none is.
  if (!promo.packQuantity) return promo.loose ? promo.promoPrice : Number.POSITIVE_INFINITY;
  return promo.packUnit === "szt"
    ? promo.promoPrice / promo.packQuantity
    : (promo.promoPrice / promo.packQuantity) * 1000;
}

/**
 * The best current deals on each staple of `WATCHED`, cheapest per kilo first,
 * at most `perGroup` each, one offer once. A staple with no deal is left out.
 */
export function highlights(promos: ShopPromo[], today: string, perGroup = 3): HighlightGroup[] {
  const active = promos.filter(
    (promo) => !promo.shelf && promo.validFrom <= today && (promo.validTo === null || promo.validTo >= today),
  );
  return WATCHED.flatMap(({ label, item, unit }) => {
    const seen = new Set<string>();
    const deals = matchPromos({ name: item, unit }, active, [])
      .estimates.map((estimate): Highlight => ({ promo: estimate.promo, assumed: estimate.packAssumed }))
      .filter(({ promo }) => {
        const key = `${promo.shop}|${fold(promo.name)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => perUnitValue(a.promo) - perUnitValue(b.promo))
      .slice(0, perGroup);
    return deals.length > 0 ? [{ label, item, deals }] : [];
  });
}

/* "Porównaj ceny": what I typed, priced at every shop ----------------------- */

export type QuickOffer = {
  shop: Shop;
  promo: ShopPromo;
  /** The offer named no pack: the usual one was assumed to compare it. */
  assumed: boolean;
  /** Confirmed earlier with "Tak" for this item. */
  confirmed: boolean;
};

export type QuickItem = {
  /** As typed: "małe jaja". */
  name: string;
  /** The cheapest offer at each shop that has one, cheapest per kilo (or piece) first. */
  offers: QuickOffer[];
  /** Shops with no offer for it. */
  missing: Shop[];
};

/** "małe jaja, chleb i mięso drobiowe" -> three items; at most 15. */
export function parseQuickList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,;\n]+|\s+(?:i|oraz|plus)\s+/i)
        .map((part) =>
          part
            .trim()
            .replace(/^[-•*\d.)\s]+/, "")
            .replace(/\s+/g, " "),
        )
        .filter((part) => part.length >= 2),
    ),
  ].slice(0, 15);
}

/**
 * Each typed item priced at every shop: the cheapest offer per kilo (or piece)
 * among the promos valid today and the shelf prices, by the same rules as the
 * shopping list, a confirmed "Tak" first. Nothing guessed beyond the usual pack.
 */
export function quickCompare(text: string, promos: ShopPromo[], links: ProductLink[], today: string): QuickItem[] {
  const active = promos.filter(
    (promo) => promo.validFrom <= today && (promo.validTo === null || promo.validTo >= today),
  );
  return parseQuickList(text).map((name) => {
    const unit: Unit = /jaj/i.test(name) ? "szt" : "g";
    const offers: QuickOffer[] = [];
    for (const shop of SHOPS) {
      const match = matchPromos(
        { name, unit },
        active.filter((promo) => promo.shop === shop),
        links.filter((link) => link.shop === shop),
      );
      const candidates: QuickOffer[] = [
        ...match.confirmed.map((promo) => ({ shop, promo, assumed: false, confirmed: true })),
        ...match.estimates.map(({ promo, packAssumed }) => ({ shop, promo, assumed: packAssumed, confirmed: false })),
      ].filter((offer) => Number.isFinite(perUnitValue(offer.promo)));
      const best = candidates.sort((a, b) => perUnitValue(a.promo) - perUnitValue(b.promo))[0];
      if (best) offers.push(best);
    }
    offers.sort((a, b) => perUnitValue(a.promo) - perUnitValue(b.promo));
    return { name, offers, missing: SHOPS.filter((shop) => !offers.some((offer) => offer.shop === shop)) };
  });
}
