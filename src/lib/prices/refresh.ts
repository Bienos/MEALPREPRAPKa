import "server-only";

import { todayIso } from "@/lib/date";
import {
  deleteExpiredPromos,
  getRefreshedAt,
  listRefreshedAt,
  listShelfPrices,
  markManyRefreshed,
  markRefreshed,
  replaceShopPromos,
  upsertShelfPrices,
  upsertShopPromos,
} from "@/lib/db/prices";
import { listShoppingItems } from "@/lib/db/shopping";
import type { Unit } from "@/lib/meals/ingredients";
import { fetchAuchanCategories, fetchAuchanCategoryList, MAX_AUCHAN_CATEGORIES } from "./auchan";
import {
  fetchBiedronkaCategories,
  fetchBiedronkaCategoryList,
  MAX_CATEGORIES_PER_REFRESH,
  fetchBiedronkaSitemap,
  fetchShelfPrices,
  MAX_PAGES_PER_REFRESH,
  type ShelfResult,
} from "./biedronka";
import { fetchBlixPromos, fetchBlixSweep } from "./blix";
import { fetchLidlPromos } from "./lidl";
import { fetchFriscoFeed, matchName, toFriscoShelfPrice } from "./frisco";
import { fetchStokrotkaFeed, toShelfPrice } from "./stokrotka";
import { SHOP_LABELS, type CategoryEntry, type ShelfPrice } from "./types";
import { blixSearchFor, catalogCandidates, categoriesFor } from "./match";
import { disabledNote, isSourceEnabled } from "@/lib/grocery/policy";
import type { ProviderId } from "@/lib/grocery/providers";

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

/** A category page read less than this many days ago is not read again. */
const CATEGORY_FRESH_DAYS = 3;
/** Products kept per shopping item from the category pages read: the plainest, then the basket takes the cheapest. */
const CATEGORY_PER_ITEM = 10;
/** Category pages looked at per shopping item. */
const CATEGORIES_PER_ITEM = 6;

type ShelfCategorySource = {
  shop: "auchan" | "biedronka";
  provider: ProviderId;
  list: () => Promise<CategoryEntry[]>;
  read: (batch: CategoryEntry[]) => Promise<{
    prices: ShelfPrice[];
    done: CategoryEntry[];
    failed: number;
    limited: boolean;
  }>;
  maxPerTap: number;
};

/**
 * A shop's regular prices from its category pages: for each item on my list
 * the shelves that could hold it (not read in the last few days), a batch of
 * them per tap; every product on them is priced, and the plainest few per item
 * are kept, so the basket can take the cheapest brand.
 */
async function refreshShelfCategories(source: ShelfCategorySource): Promise<FeedRefresh> {
  if (!isSourceEnabled(source.provider)) return { count: 0, skipped: true, disabled: disabledNote(source.provider) };
  const now = new Date();
  const items = (await listShoppingItems()).filter((item) => !item.checked && !item.owned);
  if (items.length === 0) return { count: 0, skipped: false };
  const [categories, readAt] = await Promise.all([source.list(), listRefreshedAt(`cat:${source.shop}:`)]);
  const freshSince = new Date(now.getTime() - CATEGORY_FRESH_DAYS * 86_400_000).toISOString();
  const key = (category: CategoryEntry) => `cat:${source.shop}:${category.url}`;

  const wanted = [
    ...new Map(
      items
        .flatMap((item) => categoriesFor(item.name, categories, CATEGORIES_PER_ITEM))
        .map((category) => [category.url, category]),
    ).values(),
  ].filter((category) => (readAt.get(key(category)) ?? "") < freshSince);
  if (wanted.length === 0) return { count: 0, skipped: true };

  const batch = wanted.slice(0, source.maxPerTap);
  const result = await source.read(batch);
  if (result.done.length === 0) {
    throw new Error(
      result.limited
        ? `${SHOP_LABELS[source.shop]} prosi o zwolnienie, spróbuj za kilka minut.`
        : `Sklep ${SHOP_LABELS[source.shop]} nie pokazał żadnej półki.`,
    );
  }

  const products = new Map<string, ShelfPrice>();
  for (const price of result.prices) products.set(price.productKey, price);
  const entries = [...products.values()];
  const kept = new Map<string, ShelfPrice>();
  for (const item of items) {
    for (const candidate of catalogCandidates(item.name, item.unit as Unit | null, entries, CATEGORY_PER_ITEM)) {
      kept.set(candidate.productKey, candidate);
    }
  }
  await upsertShelfPrices(source.shop, [...kept.values()], now.toISOString());
  await markManyRefreshed(result.done.map(key), now.toISOString());
  console.info(
    `[prices] ${source.shop} categories: ${result.prices.length} products on ${result.done.length} pages (${result.failed} failed${result.limited ? ", asked to slow down" : ""}), ${kept.size} kept, ${wanted.length - result.done.length} waiting`,
  );
  const waiting = wanted.length - result.done.length;
  const label = SHOP_LABELS[source.shop];
  const note = result.limited
    ? `${label} prosi o zwolnienie: ${waiting} półek zostało, spróbuj za kilka minut.`
    : waiting > 0
      ? `${label}: jeszcze ${waiting} półek, kliknij ponownie.`
      : undefined;
  return { count: kept.size, skipped: false, note };
}

export const refreshAuchanShelf = () =>
  refreshShelfCategories({
    shop: "auchan",
    provider: "auchan-online",
    list: fetchAuchanCategoryList,
    read: fetchAuchanCategories,
    maxPerTap: MAX_AUCHAN_CATEGORIES,
  });

export const refreshBiedronkaCategoryShelf = () =>
  refreshShelfCategories({
    shop: "biedronka",
    provider: "biedronka-online",
    list: fetchBiedronkaCategoryList,
    read: fetchBiedronkaCategories,
    maxPerTap: MAX_CATEGORIES_PER_REFRESH,
  });

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
  // Sources without permission on record are read only when the owner turned them on (grocery/policy.ts).
  const enabled = {
    lidl: isSourceEnabled("lidl-web"),
    blix: isSourceEnabled("blix"),
    shelf: isSourceEnabled("biedronka-online"),
  };

  const [lidl, blix, shelf] = await Promise.allSettled([
    enabled.lidl ? fetchLidlPromos(now) : Promise.resolve(null),
    enabled.blix && searches.length > 0 ? fetchBlixPromos(searches, now) : Promise.resolve(null),
    enabled.shelf && items.length > 0
      ? refreshBiedronkaShelf(
          items.map((item) => ({ name: item.name, unit: item.unit as Unit | null })),
          now,
        )
      : Promise.resolve(null),
  ]);

  let count = 0;
  const warnings: string[] = [];
  const errors: unknown[] = [];
  const disabled = (["lidl-web", "blix", "biedronka-online"] as const).filter((id) => !isSourceEnabled(id));
  if (disabled.length > 0) warnings.push(disabledSummary(disabled));

  if (lidl.status === "fulfilled" && lidl.value) {
    await replaceShopPromos(["lidl"], lidl.value, fetchedAt, "lidl:");
    count += lidl.value.length;
    console.info(`[prices] lidl: ${lidl.value.length} promos`);
  } else if (lidl.status === "rejected") {
    errors.push(lidl.reason);
    warnings.push(messageOf(lidl.reason, "Lidl: nie udało się pobrać promocji."));
  }

  if (blix.status === "fulfilled" && blix.value) {
    const { promos, searched, failed } = blix.value;
    // Added, not replaced: the full sweep's offers stay; offers that ended are dropped.
    await upsertShopPromos(promos, fetchedAt);
    await deleteExpiredPromos(todayIso());
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

  // Every source that was tried failed: say why instead of "0 promocji". Expired offers still go.
  const tried = [lidl, blix, shelf].filter((one) => one.status === "rejected" || one.value !== null);
  if (tried.length > 0 && tried.every((one) => one.status === "rejected")) {
    throw errors[0] instanceof Error ? errors[0] : new Error(warnings.join(" "));
  }
  if (tried.length === 0) await deleteExpiredPromos(todayIso());
  return { count, warnings };
}

/** One line for every source left off this time, instead of one per source. */
function disabledSummary(ids: ProviderId[]): string {
  if (ids.length === 1) return disabledNote(ids[0]);
  return `Bez potwierdzonej zgody, więc wyłączone: ${ids.map((id) => sourceName(id)).join(", ")} (zob. Źródła danych).`;
}

function sourceName(id: ProviderId): string {
  return { "lidl-web": "lidl.pl", blix: "gazetki Blix", "biedronka-online": "sklep online Biedronki" }[id as string] ?? id;
}

function messageOf(error: unknown, fallback: string): string {
  console.error("[prices] refresh source failed:", error);
  return error instanceof Error ? error.message : fallback;
}

/** Stokrotka's feed is big and slow to build, so it is read again only after this many hours. */
const FEED_FRESH_HOURS = 12;
/** Feed products kept per shopping item: the plainest few, in stock first. */
const FEED_PER_ITEM = 5;

export type FeedRefresh = {
  count: number;
  skipped: boolean;
  note?: string;
  /** The source is off (no permission on record or not configured): why, in Polish. */
  disabled?: string;
};

/**
 * Stokrotka's regular prices from the product feed its shop publishes (one
 * request, up to a minute, so it has a call of its own after "Sprawdź
 * promocje"). The products that look like my list are kept in shelf_prices.
 */
export async function refreshStokrotkaPrices(): Promise<FeedRefresh> {
  if (!isSourceEnabled("stokrotka-feed")) return { count: 0, skipped: true, disabled: disabledNote("stokrotka-feed") };
  const now = new Date();
  const stored = (await listShelfPrices()).filter((price) => price.shop === "stokrotka");
  const newest = stored.reduce((latest, price) => (price.fetchedAt > latest ? price.fetchedAt : latest), "");
  if (newest && now.getTime() - new Date(newest).getTime() < FEED_FRESH_HOURS * 3_600_000) {
    return { count: stored.length, skipped: true };
  }

  const items = (await listShoppingItems()).filter((item) => !item.checked && !item.owned);
  if (items.length === 0) return { count: 0, skipped: false };
  const feed = await fetchStokrotkaFeed();
  const prices = new Map<string, ShelfPrice>();
  for (const item of items) {
    const candidates = catalogCandidates(item.name, item.unit as Unit | null, feed, 40)
      .sort((a, b) => Number(b.inStock) - Number(a.inStock))
      .slice(0, FEED_PER_ITEM);
    for (const candidate of candidates) {
      const price = toShelfPrice(candidate);
      if (price) prices.set(price.productKey, price);
    }
  }
  await upsertShelfPrices("stokrotka", [...prices.values()], now.toISOString());
  console.info(`[prices] stokrotka feed: ${feed.length} products, ${prices.size} kept`);
  return { count: prices.size, skipped: false };
}

/**
 * Frisco's regular prices from the feed it publishes (the whole range in one
 * request, a few seconds). Same shape as Stokrotka's: the plainest few
 * in-stock products per item on my list go to shelf_prices.
 */
export async function refreshFriscoPrices(): Promise<FeedRefresh> {
  // Frisco allows its feed for personal, non-commercial use (robots.txt); this checks the app still is that.
  if (!isSourceEnabled("frisco-feed")) return { count: 0, skipped: true, disabled: disabledNote("frisco-feed") };
  const now = new Date();
  const stored = (await listShelfPrices()).filter((price) => price.shop === "frisco");
  const newest = stored.reduce((latest, price) => (price.fetchedAt > latest ? price.fetchedAt : latest), "");
  if (newest && now.getTime() - new Date(newest).getTime() < FEED_FRESH_HOURS * 3_600_000) {
    return { count: stored.length, skipped: true };
  }

  const items = (await listShoppingItems()).filter((item) => !item.checked && !item.owned);
  if (items.length === 0) return { count: 0, skipped: false };
  const products = (await fetchFriscoFeed()).filter((product) => product.inStock);
  const feed = products.map((product) => ({ name: matchName(product), product }));
  const prices = new Map<string, ShelfPrice>();
  for (const item of items) {
    for (const candidate of catalogCandidates(item.name, item.unit as Unit | null, feed, FEED_PER_ITEM)) {
      const price = toFriscoShelfPrice(candidate.product);
      if (price) prices.set(price.productKey, price);
    }
  }
  await upsertShelfPrices("frisco", [...prices.values()], now.toISOString());
  console.info(`[prices] frisco feed: ${products.length} products, ${prices.size} kept`);
  return { count: prices.size, skipped: false };
}

/** A finished sweep is not repeated for this many hours. */
const SWEEP_FRESH_HOURS = 12;
/** The sweep gives up starting new pages this long after it began (the request limit is 60 s). */
const SWEEP_BUDGET_MS = 50_000;

export type SweepRefresh = {
  pagesRead: number;
  pagesTotal: number;
  complete: boolean;
  skipped: boolean;
  /** The source is off: why, in Polish. */
  disabled?: string;
};

/**
 * Every grocery offer of the priced chains from the Blix leaflets (about 115
 * to 145 pages, up to a minute), so matching never depends on a search term.
 * Saved as it goes; a sweep that ran out of time says how far it got and the
 * next tap does it again.
 */
export async function refreshBlixSweep(): Promise<SweepRefresh> {
  if (!isSourceEnabled("blix")) {
    return { pagesRead: 0, pagesTotal: 0, complete: true, skipped: true, disabled: disabledNote("blix") };
  }
  const started = Date.now();
  const last = await getRefreshedAt("blix-sweep");
  if (last && started - new Date(last).getTime() < SWEEP_FRESH_HOURS * 3_600_000) {
    return { pagesRead: 0, pagesTotal: 0, complete: true, skipped: true };
  }
  const now = new Date();
  const result = await fetchBlixSweep(started + SWEEP_BUDGET_MS, now);
  await upsertShopPromos(result.promos, now.toISOString());
  await deleteExpiredPromos(todayIso());
  if (result.complete) await markRefreshed("blix-sweep", now.toISOString());
  console.info(
    `[prices] blix sweep: ${result.promos.length} offers, ${result.pagesRead}/${result.pagesTotal} pages in ${Date.now() - started} ms`,
  );
  return { pagesRead: result.pagesRead, pagesTotal: result.pagesTotal, complete: result.complete, skipped: false };
}
