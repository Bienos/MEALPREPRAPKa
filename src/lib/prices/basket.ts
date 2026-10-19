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
 * - an item with no usable price is "bez ceny" and stays out of the total.
 *   Nothing is guessed.
 */

import type { Unit } from "../meals/ingredients.ts";
import type { Shop, ShopPrice, ShopPromo } from "./types.ts";

/** A shopping-list row still to buy. */
export type NeededItem = { id: string; name: string; quantity: number | null; unit: Unit | null };

/** One way to buy an item at a shop: a confirmed promo, or my own price. */
export type PriceOption = { kind: "promo"; promo: ShopPromo } | { kind: "mine"; price: ShopPrice };

export type ItemCost = {
  amount: number;
  /** Whole packs, or the share of a pack for loose produce. */
  packs: number;
  option: PriceOption;
  /** The promo price applied to at least one pack. */
  onPromo: boolean;
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
  /** Sum of every priced line at this shop. */
  total: number;
  priced: number;
  onPromo: number;
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
export function packInItemUnit(packQuantity: number | null, packUnit: Unit | null, itemUnit: Unit | null): number | null {
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

  if (option.kind === "mine") return { amount: round(packs * option.price.price), packs, option, onPromo: false };

  const { promoPrice, regularPrice, multibuyMin } = option.promo;
  if (loose || multibuyMin <= 1) return { amount: round(packs * promoPrice), packs, option, onPromo: true };

  const promoPacks = Math.floor(packs / multibuyMin) * multibuyMin;
  const rest = packs - promoPacks;
  if (rest > 0 && regularPrice === null) return null;
  const amount = promoPacks * promoPrice + rest * (regularPrice ?? 0);
  return { amount: round(amount), packs, option, onPromo: promoPacks > 0 };
}

/** The cheapest usable option for one item at one shop. */
export function priceLine(item: NeededItem, options: PriceOption[]): BasketLine {
  let best: ItemCost | null = null;
  let unitMismatch = false;
  for (const option of options) {
    const cost = costOf(item, option);
    if (cost === "unit") unitMismatch = true;
    else if (cost && (!best || cost.amount < best.amount)) best = cost;
  }
  return { item, cost: best, missing: best ? null : unitMismatch ? "unit" : "no-price" };
}

export function buildBasket(
  items: NeededItem[],
  shops: readonly Shop[],
  optionsFor: (item: NeededItem, shop: Shop) => PriceOption[],
): BasketSummary {
  const baskets: ShopBasket[] = shops.map((shop) => {
    const lines = items.map((item) => priceLine(item, optionsFor(item, shop)));
    const priced = lines.filter((line) => line.cost);
    return {
      shop,
      lines,
      total: round(priced.reduce((sum, line) => sum + (line.cost?.amount ?? 0), 0)),
      priced: priced.length,
      onPromo: priced.filter((line) => line.cost?.onPromo).length,
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
  const amountAt = (basket: ShopBasket, index: number) => basket.lines[index].cost?.amount ?? 0;

  const totals: Partial<Record<Shop, number>> = {};
  for (const basket of contenders) {
    totals[basket.shop] = round(
      items.reduce((sum, item, index) => sum + (compared.has(item.id) ? amountAt(basket, index) : 0), 0),
    );
  }

  let cheapest: Shop | null = null;
  let split: BasketSummary["split"] = null;
  if (compared.size > 0 && contenders.length > 1) {
    const sorted = [...contenders].sort((a, b) => totals[a.shop]! - totals[b.shop]!);
    if (totals[sorted[1].shop]! - totals[sorted[0].shop]! >= 0.01) cheapest = sorted[0].shop;
    const splitTotal = round(
      items.reduce(
        (sum, item, index) =>
          compared.has(item.id) ? sum + Math.min(...contenders.map((basket) => amountAt(basket, index))) : sum,
        0,
      ),
    );
    const savings = round(totals[sorted[0].shop]! - splitTotal);
    if (savings >= 0.01) split = { total: splitTotal, savings };
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

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
