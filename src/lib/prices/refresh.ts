import "server-only";

import { listShelfPrices, replaceShopPromos, upsertShelfPrices } from "@/lib/db/prices";
import { listShoppingItems } from "@/lib/db/shopping";
import type { Unit } from "@/lib/meals/ingredients";
import { fetchBiedronkaSitemap, fetchShelfPrices, MAX_PAGES_PER_REFRESH, type ShelfResult } from "./biedronka";
import { BLIX_SHOPS, fetchBlixPromos } from "./blix";
import { fetchLidlPromos } from "./lidl";
import { blixSearchFor, catalogCandidates } from "./match";

/** Products read per shopping item: the plainest few that the rules accept. */
const SHELF_CANDIDATES = 4;
/** A shelf price younger than this is not read again. */
const SHELF_FRESH_DAYS = 14;

/**
 * Biedronka's regular prices for products that look like my list: the
 * sitemap, then the product pages not read in the last two weeks (at most a
 * few dozen per tap; the rest on the next one).
 */
async function refreshBiedronkaShelf(
  items: { name: string; unit: Unit | null }[],
  now: Date,
): Promise<ShelfResult & { waiting: number }> {
  const [catalogue, stored] = await Promise.all([fetchBiedronkaSitemap(), listShelfPrices()]);
  const freshSince = new Date(now.getTime() - SHELF_FRESH_DAYS * 86_400_000).toISOString();
  const fresh = new Set(stored.filter((price) => price.fetchedAt >= freshSince).map((price) => price.productKey));
  const wanted = [
    ...new Map(
      items
        .flatMap((item) => catalogCandidates(item.name, item.unit, catalogue, SHELF_CANDIDATES))
        .map((entry) => [entry.productKey, entry]),
    ).values(),
  ].filter((entry) => !fresh.has(entry.productKey));
  const result = await fetchShelfPrices(wanted);
  await upsertShelfPrices("biedronka", result.prices, now.toISOString());
  return { ...result, waiting: Math.max(0, wanted.length - MAX_PAGES_PER_REFRESH) };
}

export type RefreshResult = {
  /** Promotions stored, all shops together. */
  count: number;
  /** What could not be read this time, in Polish; the old rows of that source stay. */
  warnings: string[];
};

/**
 * "Sprawdź promocje", only when I tap:
 * - Lidl: one request to lidl.pl for the deals its site shows;
 * - every chain, Lidl included: their leaflets through Blix, one search (at most two
 *   pages) per shopping-list item still to buy;
 * - Biedronka's regular shelf prices from its online shop, for the products
 *   that look like the list.
 * Each source is fetched and validated in full before its old rows are
 * replaced, so a failed or changed response leaves last week's data alone.
 * When one source fails the other is still saved; when both fail it throws.
 */
export async function refreshShopPromos(): Promise<RefreshResult> {
  const now = new Date();
  const fetchedAt = now.toISOString();
  const items = (await listShoppingItems()).filter((item) => !item.checked && !item.owned);
  const searches = items.flatMap((item) => blixSearchFor(item.name) ?? []);

  const [lidl, blix, shelf] = await Promise.allSettled([
    fetchLidlPromos(now),
    searches.length > 0 ? fetchBlixPromos(searches, now) : Promise.resolve(null),
    items.length > 0
      ? refreshBiedronkaShelf(
          items.map((item) => ({ name: item.name, unit: item.unit as Unit | null })),
          now,
        )
      : Promise.resolve(null),
  ]);

  let count = 0;
  const warnings: string[] = [];
  const errors: unknown[] = [];

  if (lidl.status === "fulfilled") {
    await replaceShopPromos(["lidl"], lidl.value, fetchedAt, "lidl:");
    count += lidl.value.length;
    console.info(`[prices] lidl: ${lidl.value.length} promos`);
  } else {
    errors.push(lidl.reason);
    warnings.push(messageOf(lidl.reason, "Lidl: nie udało się pobrać promocji."));
  }

  if (blix.status === "fulfilled" && blix.value) {
    const { promos, searched, failed } = blix.value;
    await replaceShopPromos(Object.values(BLIX_SHOPS), promos, fetchedAt, "blix:");
    count += promos.length;
    if (failed > 0) warnings.push(`Gazetki: ${failed} z ${searched} wyszukiwań się nie udało, reszta jest.`);
    console.info(`[prices] blix: ${promos.length} promos from ${searched} searches (${failed} failed)`);
  } else if (blix.status === "rejected") {
    errors.push(blix.reason);
    warnings.push(messageOf(blix.reason, "Gazetki: nie udało się pobrać ofert z Blix."));
  }

  if (shelf.status === "fulfilled" && shelf.value) {
    const { prices, read, failed, waiting } = shelf.value;
    count += prices.length;
    if (failed > 0) warnings.push(`Biedronka: ${failed} z ${read} stron produktów się nie udało.`);
    if (waiting > 0) warnings.push(`Biedronka: jeszcze ${waiting} produktów do sprawdzenia, kliknij ponownie.`);
    console.info(
      `[prices] biedronka shelf: ${prices.length} prices from ${read} pages (${failed} failed, ${waiting} waiting)`,
    );
  } else if (shelf.status === "rejected") {
    warnings.push(messageOf(shelf.reason, "Biedronka: nie udało się odczytać cen z półki."));
  }

  // Nothing could be read at all: say why instead of "0 promocji".
  if (
    lidl.status === "rejected" &&
    (blix.status === "rejected" || searches.length === 0) &&
    shelf.status !== "fulfilled"
  ) {
    throw errors[0] instanceof Error ? errors[0] : new Error(warnings.join(" "));
  }
  return { count, warnings };
}

function messageOf(error: unknown, fallback: string): string {
  console.error("[prices] refresh source failed:", error);
  return error instanceof Error ? error.message : fallback;
}
