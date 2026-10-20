/**
 * What the shopping list costs at each shop. Pure arithmetic, client-safe, so
 * the card on Zakupy recalculates the moment an item is ticked off.
 *
 * Rules:
 * - only items still to buy are priced (the caller passes those);
 * - packs = ceil(needed / pack size), cost = packs x price; loose produce
 *   ("luzem") costs exactly what is taken;
 * - a promo counts while it is valid today, app-only ones included;
 * - a multi-buy price applies to whole multiples of its pack count, the rest
 *   at the regular price;
 * - a leaflet offer that only looks like the item counts as an estimate, and
 *   says so; the cheapest usable option wins, and buying whole packs means
 *   the amount is always covered (500 g needed, 250 g packs: two of them);
 * - an item with no usable price is "bez ceny" and stays out of the total;
 * - money is summed in whole grosz (złoty are only what goes in and out);
 * - an option can carry its eligibility (grocery/eligibility.ts) and a rank:
 *   the lowest rank wins first, then the lowest cost, so a dated history
 *   price only fills a gap and never undercuts today's offers.
 */

import type { EligibilityState } from "../grocery/eligibility.ts";
import type { MatchTier } from "../grocery/matching.ts";
import type { Unit } from "../meals/ingredients.ts";
import type { Shop, ShopPrice, ShopPromo } from "./types.ts";

/** A shopping-list row still to buy. */
export type NeededItem = { id: string; name: string; quantity: number | null; unit: Unit | null };

/**
 * One way to buy an item at a shop: a confirmed promo, a leaflet offer the
 * rules think fits (an estimate), or my own price.
 */
export type PriceOption = (
  | { kind: "promo"; promo: ShopPromo; estimate?: { packAssumed: boolean } }
  | { kind: "mine"; price: ShopPrice }
) & {
  /** Lower is preferred before price is compared; 0 when not given. */
  rank?: number;
  /** What the eligibility engine said about this price, and why. */
  state?: EligibilityState;
  reasons?: string[];
  /** How sure the product is the item. */
  match?: MatchTier;
  /** What the item names that the product does not state ("zawartość tłuszczu"). */
  matchNotes?: string[];
};

export type ItemCost = {
  /** Złoty, for display; `amountGrosz` is what is summed. */
  amount: number;
  amountGrosz: number;
  /** Whole packs, or the share of a pack for loose produce. */
  packs: number;
  option: PriceOption;
  /** The promo price applied to at least one pack. */
  onPromo: boolean;
  /** From a leaflet offer not yet confirmed as this item. */
  estimated: boolean;
  /** The offer named no pack, so the usual one was assumed. */
  packAssumed: boolean;
};

export type BasketLine = {
  item: NeededItem;
  cost: ItemCost | null;
  /** Why there is no cost: nothing known, or only prices in a unit the list does not use. */
  missing: "no-price" | "unit" | null;
};

export type ShopBasket = {
  shop: Shop;
  lines: BasketLine[];
  /** Sum of every priced line at this shop (złoty, from `totalGrosz`). */
  total: number;
  totalGrosz: number;
  priced: number;
  /** Every item on the list has a price here. Only a complete basket can be "the cheapest". */
  complete: boolean;
  /** Priced lines by eligibility state, when the options carried one. */
  states: Partial<Record<EligibilityState, number>>;
  onPromo: number;
  /** Of the priced items, how many rest on an unconfirmed leaflet offer. */
  estimated: number;
};

export type BasketSummary = {
  shops: ShopBasket[];
  itemCount: number;
  /**
   * The shops that price enough of the list to be weighed against each other,
   * compared on the items every one of them prices: the only fair ground to
   * say which is cheaper. Shops with a few leaflet hits are not in it.
   */
  compared: { shops: Shop[]; count: number; totals: Partial<Record<Shop, number>>; cheapest: Shop | null };
  /** Each compared item bought wherever it is cheaper, and what that saves over the cheaper shop. */
  split: { total: number; savings: number } | null;
};

/** A shop pricing at least this share of the list takes part in the comparison. */
const COMPARE_COVERAGE = 0.5;

export function isPromoActive(promo: Pick<ShopPromo, "validFrom" | "validTo">, today: string): boolean {
  return promo.validFrom <= today && (promo.validTo === null || today <= promo.validTo);
}

/**
 * A pack's amount in the list's unit. Grams and millilitres count as the same
 * (1 ml ≈ 1 g is close enough for food); pieces never mix with weight.
 */
export function packInItemUnit(
  packQuantity: number | null,
  packUnit: Unit | null,
  itemUnit: Unit | null,
): number | null {
  if (packQuantity === null || packUnit === null) return null;
  if (itemUnit === null || packUnit === itemUnit) return packQuantity;
  const weightOrVolume = (unit: Unit) => unit === "g" || unit === "ml";
  return weightOrVolume(packUnit) && weightOrVolume(itemUnit) ? packQuantity : null;
}

/** Cost of an item from one option; "unit" when the pack cannot be compared with the list amount. */
export function costOf(item: NeededItem, option: PriceOption): ItemCost | "unit" | null {
  const [packQuantity, packUnit, loose] =
    option.kind === "promo"
      ? [option.promo.packQuantity, option.promo.packUnit, option.promo.loose]
      : [option.price.packQuantity, option.price.packUnit, false];

  let packs = 1; // no amount on the list: one pack
  if (item.quantity !== null && item.unit !== null) {
    const size = packInItemUnit(packQuantity, packUnit, item.unit);
    if (size === null) return "unit";
    const exact = item.quantity / size;
    packs = loose ? exact : Math.ceil(exact - 1e-9);
  }
  const cost = (grosz: number, rest: Omit<ItemCost, "amount" | "amountGrosz" | "packs" | "option">): ItemCost => ({
    amount: grosz / 100,
    amountGrosz: grosz,
    packs,
    option,
    ...rest,
  });

  if (option.kind === "mine") {
    return cost(times(toGrosz(option.price.price), packs), {
      onPromo: false,
      estimated: false,
      packAssumed: false,
    });
  }

  const { promoPrice, regularPrice, multibuyMin } = option.promo;
  const estimated = option.estimate !== undefined;
  const packAssumed = option.estimate?.packAssumed ?? false;
  if (option.promo.shelf || option.promo.historical) {
    return cost(times(toGrosz(promoPrice), packs), { onPromo: false, estimated, packAssumed });
  }
  if (loose || multibuyMin <= 1) {
    return cost(times(toGrosz(promoPrice), packs), { onPromo: true, estimated, packAssumed });
  }

  const promoPacks = Math.floor(packs / multibuyMin) * multibuyMin;
  const rest = packs - promoPacks;
  if (rest > 0 && regularPrice === null) return null;
  const grosz = promoPacks * toGrosz(promoPrice) + rest * toGrosz(regularPrice ?? 0);
  return cost(grosz, { onPromo: promoPacks > 0, estimated, packAssumed });
}

/** The cheapest usable option for one item at one shop. */
export function priceLine(item: NeededItem, options: PriceOption[]): BasketLine {
  let best: ItemCost | null = null;
  let unitMismatch = false;
  for (const option of options) {
    const cost = costOf(item, option);
    if (cost === "unit") unitMismatch = true;
    else if (cost && (!best || better(cost, best))) best = cost;
  }
  return { item, cost: best, missing: best ? null : unitMismatch ? "unit" : "no-price" };
}

function better(a: ItemCost, b: ItemCost): boolean {
  const rankA = a.option.rank ?? 0;
  const rankB = b.option.rank ?? 0;
  return rankA !== rankB ? rankA < rankB : a.amountGrosz < b.amountGrosz;
}

export function buildBasket(
  items: NeededItem[],
  shops: readonly Shop[],
  optionsFor: (item: NeededItem, shop: Shop) => PriceOption[],
): BasketSummary {
  const baskets: ShopBasket[] = shops.map((shop) => {
    const lines = items.map((item) => priceLine(item, optionsFor(item, shop)));
    const priced = lines.filter((line) => line.cost);
    const totalGrosz = priced.reduce((sum, line) => sum + (line.cost?.amountGrosz ?? 0), 0);
    const states: Partial<Record<EligibilityState, number>> = {};
    for (const line of priced) {
      const state = line.cost?.option.state;
      if (state) states[state] = (states[state] ?? 0) + 1;
    }
    return {
      shop,
      lines,
      total: totalGrosz / 100,
      totalGrosz,
      priced: priced.length,
      complete: items.length > 0 && priced.length === items.length,
      states,
      onPromo: priced.filter((line) => line.cost?.onPromo).length,
      estimated: priced.filter((line) => line.cost?.estimated).length,
    };
  });

  // The shops that price enough of the list; with fewer than two, the two that price the most.
  let contenders = baskets.filter((basket) => basket.priced > 0 && basket.priced >= items.length * COMPARE_COVERAGE);
  if (contenders.length < 2) {
    contenders = [...baskets]
      .filter((basket) => basket.priced > 0)
      .sort((a, b) => b.priced - a.priced)
      .slice(0, 2);
  }

  const compared = new Set(
    items.filter((_, index) => contenders.every((basket) => basket.lines[index].cost)).map((item) => item.id),
  );
  const amountAt = (basket: ShopBasket, index: number) => basket.lines[index].cost?.amountGrosz ?? 0;

  const totals: Partial<Record<Shop, number>> = {};
  for (const basket of contenders) {
    totals[basket.shop] =
      items.reduce((sum, item, index) => sum + (compared.has(item.id) ? amountAt(basket, index) : 0), 0) / 100;
  }

  let cheapest: Shop | null = null;
  let split: BasketSummary["split"] = null;
  if (compared.size > 0 && contenders.length > 1) {
    const sorted = [...contenders].sort((a, b) => totals[a.shop]! - totals[b.shop]!);
    if (toGrosz(totals[sorted[1].shop]!) - toGrosz(totals[sorted[0].shop]!) >= 1) cheapest = sorted[0].shop;
    const splitGrosz = items.reduce(
      (sum, item, index) =>
        compared.has(item.id) ? sum + Math.min(...contenders.map((basket) => amountAt(basket, index))) : sum,
      0,
    );
    const savingsGrosz = toGrosz(totals[sorted[0].shop]!) - splitGrosz;
    if (savingsGrosz >= 1) split = { total: splitGrosz / 100, savings: savingsGrosz / 100 };
  }

  const comparable = contenders.length > 1 && compared.size > 0;
  return {
    shops: baskets,
    itemCount: items.length,
    compared: comparable
      ? { shops: contenders.map((basket) => basket.shop), count: compared.size, totals, cheapest }
      : { shops: [], count: 0, totals: {}, cheapest: null },
    split,
  };
}

/** Złoty to whole grosz. */
function toGrosz(value: number): number {
  return Math.round(value * 100);
}

/** A grosz price times a pack count; a share of a pack (loose goods) rounds like a till. */
function times(grosz: number, packs: number): number {
  return Math.round(grosz * packs + 1e-9);
}
