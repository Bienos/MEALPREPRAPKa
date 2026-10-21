/**
 * The bridge between the shopping card and the grocery engines: every price
 * the card knows (leaflets, shelf prices, my prices, community history)
 * becomes a fact, gets its eligibility and its match tier, and lands in one
 * of three places:
 *  - strict    — verified or published, with an exact match: may decide the
 *                cheapest complete basket;
 *  - reference — anything usable, labelled: the "orientacyjnie" totals;
 *  - held      — shown with the reason it is not counted (an app I do not
 *                have, a substitution waiting for approval, another town).
 * Pure, client-safe: the card recalculates on every tap.
 */

import type { BasketSummary, NeededItem, PriceOption, ShopBasket } from "../prices/basket.ts";
import { buildBasket } from "../prices/basket.ts";
import { PROVIDERS as DELIVERY, feeFor, type DeliveryQuote } from "../prices/delivery.ts";
import type { PromoMatch } from "../prices/match.ts";
import { SHOPS, type Shop, type ShopPrice, type ShopPromo } from "../prices/types.ts";
import { assessPrice, type Assessment, type EligibilityContext } from "./eligibility.ts";
import { matchCandidate, REFERENCE_TIERS, STRICT_TIERS, type MatchResult } from "./matching.ts";
import { toGrosz } from "./money.ts";
import { providerForKey } from "./providers.ts";
import { retailerForShop } from "./retailers.ts";
import { NO_CONDITIONS, RETAILER_LOYALTY, type PriceFact } from "./types.ts";

export type PricingContext = EligibilityContext & { excludedBrands: readonly string[] };

export type HeldOption = { promo: ShopPromo; reasons: string[]; substitution: MatchResult | null };

export type AssessedLine = {
  strict: PriceOption[];
  reference: PriceOption[];
  held: HeldOption[];
};

/** Online shops' delivery towns, from the delivery providers. */
function deliveryTowns(shop: Shop): readonly string[] | "all" | null {
  return DELIVERY.find((provider) => provider.shop === shop)?.cities ?? null;
}

/** A price the card holds, as a fact for the eligibility engine. */
export function factFromPromo(promo: ShopPromo, packAssumed = false): PriceFact {
  const provider = providerForKey(promo.productKey);
  const retailer = retailerForShop(promo.shop)?.id ?? null;
  const online = provider?.channel === "online";
  const observedAt = promo.fetchedAt ?? `${promo.validFrom}T00:00:00Z`;
  const kind = promo.historical
    ? promo.historical
    : promo.shelf && !promo.productKey.startsWith("lidl-everyday:")
      ? "current_offer"
      : "published_promotion";
  return {
    providerId: provider?.id ?? null,
    retailer,
    productName: promo.name,
    amountGrosz: toGrosz(promo.promoPrice),
    currency: "PLN",
    per: "pack",
    pack: promo.packQuantity !== null && promo.packUnit !== null ? { amount: promo.packQuantity, unit: promo.packUnit } : null,
    loose: promo.loose,
    priceType: promo.shelf || promo.historical ? "regular" : promo.multibuyMin > 1 ? "multibuy" : "promotion",
    regularGrosz: promo.regularPrice !== null ? toGrosz(promo.regularPrice) : null,
    kind,
    observedAt: observedAt.length === 10 ? `${observedAt}T00:00:00Z` : observedAt,
    // A history price is a point in time: its window is the age check, not a validity date.
    validFrom: promo.historical ? null : promo.validFrom,
    validTo: promo.historical ? null : promo.validTo,
    conditions: {
      ...NO_CONDITIONS,
      loyaltyProgram: promo.appOnly && retailer ? (RETAILER_LOYALTY[retailer] ?? null) : null,
      appOnly: promo.appOnly,
      minQuantity: promo.multibuyMin,
      multibuy: promo.multibuy,
      text: promo.conditions,
    },
    evidence: { type: promo.shelf ? "web_page" : promo.historical ? "receipt" : "leaflet", url: promo.sourceUrl, recordId: promo.productKey },
    region: online
      ? { channel: "online", national: false, city: null, deliveryTowns: deliveryTowns(promo.shop) }
      : promo.historical
        ? { channel: "store", national: false, city: promo.city ?? null, deliveryTowns: null }
        : { channel: "store", national: true, city: null, deliveryTowns: null },
    availability: "unknown",
    derived: packAssumed,
  };
}

/** My own typed price: history from the day I typed it, in any shop of the chain. */
export function factFromMine(price: ShopPrice): PriceFact {
  return {
    providerId: "user-prices",
    retailer: retailerForShop(price.shop)?.id ?? null,
    productName: price.productLabel || price.itemName,
    amountGrosz: toGrosz(price.price),
    currency: "PLN",
    per: "pack",
    pack: { amount: price.packQuantity, unit: price.packUnit },
    loose: false,
    priceType: "regular",
    regularGrosz: null,
    kind: "manual",
    // A price typed before dates were kept is treated as typed today: it stays until I change it.
    observedAt: price.updatedAt ?? new Date().toISOString(),
    validFrom: null,
    validTo: null,
    conditions: NO_CONDITIONS,
    evidence: { type: "manual_entry", url: null, recordId: `mine:${price.shop}:${price.itemName}` },
    region: { channel: "store", national: true, city: null, deliveryTowns: null },
    availability: "unknown",
    derived: false,
  };
}

/** Today's offers first; dated history only where nothing current exists. */
function rankOf(assessment: Assessment): number {
  return assessment.state === "historical" || assessment.state === "community" ? 1 : 0;
}

function withAssessment(option: PriceOption, assessment: Assessment, match: MatchResult): PriceOption {
  return {
    ...option,
    rank: rankOf(assessment),
    state: assessment.state,
    reasons: assessment.reasons,
    match: match.tier,
    matchNotes: match.unknown,
  };
}

/**
 * One item at one shop: the confirmed products and the rule-matched offers
 * (from `matchPromos`) and my own price, each assessed and sorted into
 * strict, reference or held.
 */
export function assessLine(
  item: NeededItem,
  match: PromoMatch,
  mine: ShopPrice | null,
  ctx: PricingContext,
): AssessedLine {
  const line: AssessedLine = { strict: [], reference: [], held: [] };
  const need = { name: item.name, unit: item.unit };

  const consider = (option: PriceOption, promo: ShopPromo, packAssumed: boolean, confirmed: boolean) => {
    const result = confirmed
      ? matchCandidate(need, { name: promo.name, pack: null, confirmed: true })
      : matchCandidate(
          need,
          {
            name: promo.name,
            pack: promo.packQuantity !== null && promo.packUnit !== null ? { amount: promo.packQuantity, unit: promo.packUnit } : null,
            packAssumed,
          },
          { excludedBrands: ctx.excludedBrands },
        );
    if (result.tier === "none") return;
    // Someone else's receipt without a pack: guessing "the usual pack" for it is not safe.
    if (promo.historical && packAssumed) {
      line.held.push({ promo, reasons: ["zgłoszenie bez wagi opakowania: nie zgadujemy"], substitution: null });
      return;
    }
    if (result.tier === "substitution") {
      line.held.push({ promo, reasons: [`zamiennik: ${result.conflicts.join("; ")}`], substitution: result });
      return;
    }
    const assessment = assessPrice(factFromPromo(promo, packAssumed), ctx);
    if (!assessment.usable) {
      line.held.push({ promo, reasons: assessment.reasons, substitution: null });
      return;
    }
    const assessed = withAssessment(option, assessment, result);
    if (REFERENCE_TIERS.has(result.tier)) line.reference.push(assessed);
    if (assessment.strict && STRICT_TIERS.has(result.tier)) line.strict.push(assessed);
  };

  for (const promo of match.confirmed) consider({ kind: "promo", promo }, promo, false, true);
  for (const { promo, packAssumed } of match.estimates) {
    consider({ kind: "promo", promo, estimate: { packAssumed } }, promo, packAssumed, false);
  }
  if (mine) {
    const assessment = assessPrice(factFromMine(mine), ctx);
    // My own price is always the item (I typed it for it); it is history, never verified.
    if (assessment.usable) {
      line.reference.push({
        kind: "mine",
        price: mine,
        rank: 0,
        state: assessment.state,
        reasons: assessment.reasons,
        match: "listing",
      });
    }
  }
  return line;
}

/* The verdict --------------------------------------------------------------- */

export type CompleteBasket = {
  shop: Shop;
  goodsGrosz: number;
  /** Delivery on top, for an online shop; null when its fee is unknown (then there is no total). */
  deliveryGrosz: number | null;
  totalGrosz: number | null;
  online: boolean;
};

export type SplitPlan = { shops: [Shop, Shop]; totalGrosz: number; savingsGrosz: number | null };

export type Verdict = {
  /** Complete baskets from verified and published prices, cheapest first. Only these can be "the cheapest". */
  complete: CompleteBasket[];
  /** When no complete basket exists: how close each shop with verified prices is, and what it lacks. */
  coverage: { shop: Shop; priced: number; totalGrosz: number; missing: string[] }[];
  /** Two shops that together cover everything, when that is cheaper by more than a second trip is worth. */
  split: SplitPlan | null;
  itemCount: number;
};

/** A second shop is worth it only if it saves at least this much (a trip is not free). */
export const SPLIT_MIN_SAVING_GROSZ = 1000;

export const CANNOT_DETERMINE = "Nie da się ustalić najtańszego pełnego koszyka z dostępnych danych.";

/**
 * The cheapest complete basket from strict prices only. A shop missing even
 * one price is never ranked as complete; an online shop counts with its
 * delivery fee, and with an unknown fee it has no total.
 */
export function verifiedVerdict(strict: BasketSummary, quotes: DeliveryQuote[]): Verdict {
  const complete: CompleteBasket[] = strict.shops
    .filter((basket) => basket.complete && basketChannel(basket) !== "mixed")
    .map((basket) => {
      const provider = DELIVERY.find((one) => one.shop === basket.shop);
      if (basketChannel(basket) !== "online" || !provider) {
        return { shop: basket.shop, goodsGrosz: basket.totalGrosz, deliveryGrosz: 0, totalGrosz: basket.totalGrosz, online: false };
      }
      const fee = feeFor(provider, quotes.find((one) => one.provider === provider.id), basket.total);
      const belowMinimum = fee.minOrder !== null && basket.total < fee.minOrder;
      const deliveryGrosz = fee.fee === null || belowMinimum ? null : Math.round(fee.fee * 100);
      return {
        shop: basket.shop,
        goodsGrosz: basket.totalGrosz,
        deliveryGrosz,
        totalGrosz: deliveryGrosz === null ? null : basket.totalGrosz + deliveryGrosz,
        online: true,
      };
    })
    .sort((a, b) => (a.totalGrosz ?? Number.MAX_SAFE_INTEGER) - (b.totalGrosz ?? Number.MAX_SAFE_INTEGER));

  const coverage = strict.shops
    .filter((basket) => basket.priced > 0)
    .map((basket) => ({
      shop: basket.shop,
      priced: basket.priced,
      totalGrosz: basket.totalGrosz,
      missing: basket.lines.filter((line) => !line.cost).map((line) => line.item.name),
    }))
    .sort((a, b) => b.priced - a.priced || a.totalGrosz - b.totalGrosz);

  return { complete, coverage, split: bestSplit(strict, complete), itemCount: strict.itemCount };
}

/**
 * Where a basket's prices apply, from the providers of the prices it uses:
 * all online (delivered), all in a shop, or mixed (not one way to shop).
 */
export function basketChannel(basket: ShopBasket): "online" | "store" | "mixed" {
  const channels = new Set(
    basket.lines.flatMap((line) => {
      const option = line.cost?.option;
      if (!option) return [];
      if (option.kind === "mine") return ["store"];
      return [providerForKey(option.promo.productKey)?.channel === "online" ? "online" : "store"];
    }),
  );
  return channels.size > 1 ? "mixed" : channels.has("online") ? "online" : "store";
}

/**
 * The best pair of shops that together price every item (each item where it
 * is cheaper). Only shops one walks into: an online order's delivery fee is
 * per order. Offered when no single shop is complete, or when it beats the
 * cheapest complete shop by SPLIT_MIN_SAVING_GROSZ.
 */
function bestSplit(strict: BasketSummary, complete: CompleteBasket[]): SplitPlan | null {
  const stores = strict.shops.filter((basket) => basket.priced > 0 && basketChannel(basket) === "store");
  const singleBest = complete.find((one) => !one.online && one.totalGrosz !== null)?.totalGrosz ?? null;
  let best: SplitPlan | null = null;
  for (let a = 0; a < stores.length; a++) {
    for (let b = a + 1; b < stores.length; b++) {
      let total = 0;
      let covered = true;
      for (let index = 0; index < strict.itemCount; index++) {
        const costs = [stores[a].lines[index].cost?.amountGrosz, stores[b].lines[index].cost?.amountGrosz].filter(
          (value): value is number => value !== undefined,
        );
        if (costs.length === 0) {
          covered = false;
          break;
        }
        total += Math.min(...costs);
      }
      if (!covered) continue;
      if (!best || total < best.totalGrosz) {
        best = {
          shops: [stores[a].shop, stores[b].shop],
          totalGrosz: total,
          savingsGrosz: singleBest === null ? null : singleBest - total,
        };
      }
    }
  }
  if (!best) return null;
  if (singleBest !== null && singleBest - best.totalGrosz < SPLIT_MIN_SAVING_GROSZ) return null;
  return best;
}

/** Every shop's strict and reference options for the list, ready for `buildBasket`. */
export function assessAll(
  items: NeededItem[],
  matchFor: (shop: Shop, item: NeededItem) => PromoMatch,
  mineFor: (shop: Shop, item: NeededItem) => ShopPrice | null,
  ctx: PricingContext,
): { lines: Map<string, AssessedLine>; strict: BasketSummary; reference: BasketSummary } {
  const lines = new Map<string, AssessedLine>();
  for (const shop of SHOPS) {
    for (const item of items) lines.set(`${shop}|${item.id}`, assessLine(item, matchFor(shop, item), mineFor(shop, item), ctx));
  }
  const at = (shop: Shop, item: NeededItem) => lines.get(`${shop}|${item.id}`)!;
  return {
    lines,
    strict: buildBasket(items, SHOPS, (item, shop) => at(shop, item).strict),
    reference: buildBasket(items, SHOPS, (item, shop) => at(shop, item).reference),
  };
}
