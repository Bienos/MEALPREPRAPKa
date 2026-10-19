import "server-only";

import { replaceShopPromos } from "@/lib/db/prices";
import { listShoppingItems } from "@/lib/db/shopping";
import { BLIX_SHOPS, fetchBlixPromos } from "./blix";
import { fetchLidlPromos } from "./lidl";
import { blixSearchFor } from "./match";

export type RefreshResult = {
  /** Promotions stored, all shops together. */
  count: number;
  /** What could not be read this time, in Polish; the old rows of that source stay. */
  warnings: string[];
};

/**
 * "Sprawdź promocje", only when I tap:
 * - Lidl: one request to lidl.pl for every food promo;
 * - the other chains: their leaflets through Blix, one search (at most two
 *   pages) per shopping-list item still to buy that a matching rule knows.
 * Each source is fetched and validated in full before its old rows are
 * replaced, so a failed or changed response leaves last week's data alone.
 * When one source fails the other is still saved; when both fail it throws.
 */
export async function refreshShopPromos(): Promise<RefreshResult> {
  const now = new Date();
  const fetchedAt = now.toISOString();
  const items = (await listShoppingItems()).filter((item) => !item.checked && !item.owned);
  const searches = items.flatMap((item) => blixSearchFor(item.name) ?? []);

  const [lidl, blix] = await Promise.allSettled([
    fetchLidlPromos(now),
    searches.length > 0 ? fetchBlixPromos(searches, now) : Promise.resolve(null),
  ]);

  let count = 0;
  const warnings: string[] = [];
  const errors: unknown[] = [];

  if (lidl.status === "fulfilled") {
    await replaceShopPromos(["lidl"], lidl.value, fetchedAt);
    count += lidl.value.length;
    console.info(`[prices] lidl: ${lidl.value.length} promos`);
  } else {
    errors.push(lidl.reason);
    warnings.push(messageOf(lidl.reason, "Lidl: nie udało się pobrać promocji."));
  }

  if (blix.status === "fulfilled" && blix.value) {
    const { promos, searched, failed } = blix.value;
    await replaceShopPromos(Object.values(BLIX_SHOPS), promos, fetchedAt);
    count += promos.length;
    if (failed > 0) warnings.push(`Gazetki: ${failed} z ${searched} wyszukiwań się nie udało, reszta jest.`);
    console.info(`[prices] blix: ${promos.length} promos from ${searched} searches (${failed} failed)`);
  } else if (blix.status === "rejected") {
    errors.push(blix.reason);
    warnings.push(messageOf(blix.reason, "Gazetki: nie udało się pobrać ofert z Blix."));
  }

  // Nothing could be read at all: say why instead of "0 promocji".
  if (lidl.status === "rejected" && (blix.status === "rejected" || searches.length === 0)) {
    throw errors[0] instanceof Error ? errors[0] : new Error(warnings.join(" "));
  }
  return { count, warnings };
}

function messageOf(error: unknown, fallback: string): string {
  console.error("[prices] refresh source failed:", error);
  return error instanceof Error ? error.message : fallback;
}
