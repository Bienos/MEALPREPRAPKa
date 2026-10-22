/**
 * Biedronka, Lidl and Auchan side by side for the items still to buy: the
 * three shops the owner actually weighs. Pure and client-safe; it only
 * rearranges a `BasketSummary` the card already built, so the prices, packs
 * and estimates are the very ones the rest of the screen shows.
 */

import type { BasketSummary, ItemCost, NeededItem } from "./basket.ts";
import type { Shop } from "./types.ts";

export const TRIO = ["biedronka", "lidl", "auchan"] as const satisfies readonly Shop[];
export type TrioShop = (typeof TRIO)[number];

export type TrioRow = {
  item: NeededItem;
  /** What each shop charges for the amount needed; null when it has no price. */
  cells: Record<TrioShop, ItemCost | null>;
  /** The cheapest shop for this item; null when no shop has a price or the lowest is shared. */
  cheapest: TrioShop | null;
};

export type TrioTotal = {
  shop: TrioShop;
  /** Złoty over every item this shop prices. */
  total: number;
  priced: number;
  /** Items on the list this shop has no price for. */
  missing: number;
  /** Priced lines resting on an unconfirmed leaflet offer. */
  estimated: number;
};

export type TrioView = {
  rows: TrioRow[];
  itemCount: number;
  totals: TrioTotal[];
  /** Items priced by all three: the only fair ground to say who is cheaper. */
  common: {
    count: number;
    totals: Record<TrioShop, number>;
    cheapest: TrioShop | null;
    /** What the cheapest shop saves over the dearest, in złoty. */
    spread: number;
  } | null;
  /** Every item bought where it is cheapest of the three. */
  mix: {
    total: number;
    /** Items with a price somewhere among the three. */
    count: number;
    /** Items that go to each shop. */
    perShop: Record<TrioShop, number>;
    /** Over the cheapest shop that prices all of those same items, when there is one. */
    savings: number | null;
  } | null;
  /** Items none of the three prices. */
  unpriced: NeededItem[];
};

export function buildTrio(summary: BasketSummary): TrioView {
  const baskets = TRIO.map((shop) => summary.shops.find((basket) => basket.shop === shop));
  const rows: TrioRow[] = summary.shops.length === 0 ? [] : rowsOf(summary);
  const grosz = (cost: ItemCost | null) => cost?.amountGrosz ?? 0;

  const totals: TrioTotal[] = TRIO.map((shop, index) => {
    const basket = baskets[index];
    return {
      shop,
      total: (basket?.totalGrosz ?? 0) / 100,
      priced: basket?.priced ?? 0,
      missing: summary.itemCount - (basket?.priced ?? 0),
      estimated: basket?.estimated ?? 0,
    };
  });

  const commonRows = rows.filter((row) => TRIO.every((shop) => row.cells[shop]));
  let common: TrioView["common"] = null;
  if (commonRows.length > 0) {
    const sums = Object.fromEntries(
      TRIO.map((shop) => [shop, commonRows.reduce((sum, row) => sum + grosz(row.cells[shop]), 0)]),
    ) as Record<TrioShop, number>;
    const ordered = [...TRIO].sort((a, b) => sums[a] - sums[b]);
    common = {
      count: commonRows.length,
      totals: Object.fromEntries(TRIO.map((shop) => [shop, sums[shop] / 100])) as Record<TrioShop, number>,
      cheapest: sums[ordered[1]] - sums[ordered[0]] >= 1 ? ordered[0] : null,
      spread: (sums[ordered[2]] - sums[ordered[0]]) / 100,
    };
  }

  const pricedRows = rows.filter((row) => TRIO.some((shop) => row.cells[shop]));
  let mix: TrioView["mix"] = null;
  if (pricedRows.length > 0) {
    const perShop = { biedronka: 0, lidl: 0, auchan: 0 } as Record<TrioShop, number>;
    let mixGrosz = 0;
    for (const row of pricedRows) {
      const best = Math.min(...TRIO.flatMap((shop) => (row.cells[shop] ? [grosz(row.cells[shop])] : [])));
      mixGrosz += best;
      const winner = row.cheapest ?? TRIO.find((shop) => row.cells[shop] && grosz(row.cells[shop]) === best)!;
      perShop[winner] += 1;
    }
    // Savings only against a shop that prices every one of those items, or the claim is not fair.
    const full = totals.filter((entry) => entry.priced > 0 && pricedRows.every((row) => row.cells[entry.shop]));
    const bestSingle = full.length > 0 ? Math.min(...full.map((entry) => Math.round(entry.total * 100))) : null;
    const savingsGrosz = bestSingle === null ? 0 : bestSingle - mixGrosz;
    mix = {
      total: mixGrosz / 100,
      count: pricedRows.length,
      perShop,
      savings: savingsGrosz >= 1 ? savingsGrosz / 100 : null,
    };
  }

  return {
    rows,
    itemCount: summary.itemCount,
    totals,
    common,
    mix,
    unpriced: rows.filter((row) => !TRIO.some((shop) => row.cells[shop])).map((row) => row.item),
  };
}

function rowsOf(summary: BasketSummary): TrioRow[] {
  const byShop = new Map(summary.shops.map((basket) => [basket.shop, basket]));
  const first = summary.shops[0];
  return first.lines.map((line, index) => {
    const cells = Object.fromEntries(
      TRIO.map((shop) => [shop, byShop.get(shop)?.lines[index].cost ?? null]),
    ) as Record<TrioShop, ItemCost | null>;
    const priced = TRIO.filter((shop) => cells[shop]);
    const sorted = [...priced].sort((a, b) => cells[a]!.amountGrosz - cells[b]!.amountGrosz);
    // A single shop with a price is "the cheapest" only when another one could have been compared; a tie is no winner.
    const cheapest =
      sorted.length > 1 && cells[sorted[1]]!.amountGrosz > cells[sorted[0]]!.amountGrosz ? sorted[0] : null;
    return { item: line.item, cells, cheapest };
  });
}
