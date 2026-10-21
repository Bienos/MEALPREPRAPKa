/**
 * Warsaw pilot: 100 products derived from the MealPrep meal library,
 * measured against the data sources this app may use. Reproducible:
 *
 *   node scripts/warsaw-pilot.mts [--skip-off | --reuse-off <earlier pilot json>]
 *
 * Reads live: the meal sheet's public CSV export (falls back to the snapshot
 * in src/lib/meals/test-data), Open Prices (all PLN prices, Poland gate),
 * Open Food Facts search (Poland filter, 10/min: ~11 minutes), Frisco's
 * public feed (personal, non-commercial use). Lidl's everyday prices come
 * from the hand-typed leaflet list in the repo. The five web sources without
 * permission on record are NOT read (policy), and the report says so.
 *
 * Writes docs/grocery/pilot/warsaw-pilot-<date>.json and .csv.
 * Nothing here is estimated or invented: a source that gives nothing is
 * counted as zero.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { parseCsv } from "../src/lib/google-sheets/csv.ts";
import { aggregateIngredients, type Unit } from "../src/lib/meals/ingredients.ts";
import { assessPrice } from "../src/lib/grocery/eligibility.ts";
import { canonicalGtin } from "../src/lib/grocery/gtin.ts";
import { matchCandidate, tierRank, type MatchTier } from "../src/lib/grocery/matching.ts";
import { fold } from "../src/lib/grocery/normalize.ts";
import { assessAll, CANNOT_DETERMINE, factFromPromo, verifiedVerdict } from "../src/lib/grocery/pricing.ts";
import { searchOffProducts, offUserAgent, type OffProduct } from "../src/lib/grocery/providers/open-food-facts.ts";
import { fetchOpenPrices, openPricesFact, type OpenPricesRecord } from "../src/lib/grocery/providers/open-prices.ts";
import { retailerById } from "../src/lib/grocery/retailers.ts";
import { parseQuantity, unitPrice, type Quantity } from "../src/lib/grocery/units.ts";
import { fetchFriscoFeed, matchName, toFriscoShelfPrice, type FriscoItem } from "../src/lib/prices/frisco.ts";
import { LIDL_EVERYDAY } from "../src/lib/prices/lidl-everyday.ts";
import { catalogCandidates, matchPromos } from "../src/lib/prices/match.ts";
import type { ShopPromo } from "../src/lib/prices/types.ts";

const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
const NOW = new Date().toISOString();
const SKIP_OFF = process.argv.includes("--skip-off");
// Open Food Facts search is slow (10/min) and often answers 503: an earlier run's answers can be reused,
// when the matching code they were judged with has not changed. The summary says so.
const REUSE_OFF = process.argv.includes("--reuse-off") ? process.argv[process.argv.indexOf("--reuse-off") + 1] : null;
const reused: { generatedAt: string; byProduct: Map<string, unknown> } | null = REUSE_OFF
  ? (() => {
      const earlier = JSON.parse(readFileSync(REUSE_OFF, "utf8")) as {
        summary: { date: string; generatedAt?: string };
        results: { product: string; off: unknown }[];
      };
      return {
        generatedAt: earlier.summary.generatedAt ?? earlier.summary.date,
        byProduct: new Map(earlier.results.map((one) => [one.product, one.off])),
      };
    })()
  : null;
const SHEET_ID = "10-ncMSZQxVM7n93-F2cPl2vQWz0atXexrzKieQAE1sI";
const GID = 894227705;
const SNAPSHOT = new URL("../src/lib/meals/test-data/sheet-2026-10-19.csv", import.meta.url);
const OUT = new URL("../docs/grocery/pilot/", import.meta.url);
const UA = offUserAgent(null);
const ctx = { today: TODAY, city: "Warszawa", channel: "both" as const, loyalty: [], excludedBrands: [] };

/* 1. The meal library -------------------------------------------------------- */

async function loadSheet(): Promise<{ csv: string; source: string }> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    const text = await response.text();
    if (response.ok && text.includes("Składniki")) return { csv: text, source: `live sheet export (${TODAY})` };
  } catch {
    // fall through to the snapshot
  }
  return { csv: readFileSync(SNAPSHOT, "utf8"), source: "repository snapshot sheet-2026-10-19.csv (live export unavailable)" };
}

/* 2. The 100 products --------------------------------------------------------- */

/**
 * Each sheet ingredient and the retail products a shopper would buy for it.
 * A pack in the text ("800 g", "6 szt.") must be met exactly for the exact-
 * pack measurement. Grouped by the pilot's priority categories.
 */
const PRODUCTS: [category: string, ingredient: string, product: string][] = [
  // Chicken and turkey, fish
  ["meat", "pierś z kurczaka", "pierś z kurczaka"],
  ["meat", "pierś z kurczaka", "pierś z kurczaka 800 g"],
  ["meat", "pierś z kurczaka", "filet z piersi kurczaka 1 kg"],
  ["meat", "kurczak", "filet z kurczaka"],
  ["meat", "kurczak gotowy", "kurczak gotowy"],
  ["meat", "indyk", "filet z indyka"],
  ["meat", "indyk", "mięso mielone z indyka"],
  ["meat", "indyk 5%", "indyk 5%"],
  ["meat", "szynka z indyka", "szynka z indyka"],
  ["meat", "indyk/szynka", "szynka z indyka w plastrach"],
  ["meat", "wołowina", "wołowina mielona"],
  ["meat", "wołowina 5%", "wołowina 5%"],
  ["meat", "tuńczyk", "tuńczyk w sosie własnym"],
  ["meat", "tuńczyk", "tuńczyk"],
  // Dairy and eggs
  ["dairy", "białka jaj", "białka jaj"],
  ["dairy", "feta light", "feta light"],
  ["dairy", "feta light", "ser feta"],
  ["eggs", "jajka", "jajka"],
  ["eggs", "jajka", "jajka 6 szt."],
  ["eggs", "jajka", "jajka 10 szt."],
  ["eggs", "jajka", "jaja L"],
  ["eggs", "jajka", "jaja M"],
  ["eggs", "jajka", "jaja z wolnego wybiegu"],
  ["dairy", "jogurt 2%", "jogurt 2%"],
  ["dairy", "jogurt 2%", "jogurt naturalny"],
  ["dairy", "jogurt 2%", "jogurt grecki"],
  ["dairy", "jogurt 2%", "jogurt grecki naturalny 400 g"],
  ["dairy", "mozzarella light", "mozzarella light"],
  ["dairy", "mozzarella light", "mozzarella"],
  ["dairy", "ser light", "ser light"],
  ["dairy", "ser light", "ser gouda w plastrach"],
  ["dairy", "serek wiejski", "serek wiejski"],
  ["dairy", "serek wiejski", "serek wiejski lekki"],
  ["dairy", "serek wiejski", "serek wiejski 200 g"],
  ["dairy", "skyr", "skyr"],
  ["dairy", "skyr", "skyr naturalny"],
  ["dairy", "skyr", "skyr naturalny 450 g"],
  ["dairy", "skyr", "skyr naturalny 150 g"],
  ["dairy", "twaróg chudy", "twaróg chudy"],
  ["dairy", "twaróg chudy", "twaróg chudy 250 g"],
  ["dairy", "twaróg chudy", "twaróg półtłusty"],
  // Rice, pasta, bread, grains
  ["rice_pasta", "ryż", "ryż"],
  ["rice_pasta", "ryż", "ryż basmati"],
  ["rice_pasta", "ryż", "ryż jaśminowy"],
  ["rice_pasta", "ryż", "ryż brązowy"],
  ["rice_pasta", "ryż microwave gotowy", "ryż microwave gotowy"],
  ["rice_pasta", "makaron", "makaron spaghetti"],
  ["rice_pasta", "makaron", "makaron penne"],
  ["rice_pasta", "makaron", "makaron pełnoziarnisty"],
  ["rice_pasta", "orzo", "orzo"],
  ["bread", "chleb", "chleb żytni"],
  ["bread", "pieczywo", "chleb pełnoziarnisty"],
  ["bread", "pieczywo", "pieczywo"],
  ["bread", "tortilla", "tortilla pszenna"],
  ["bread", "tortille", "tortilla pełnoziarnista"],
  ["pantry", "płatki owsiane", "płatki owsiane"],
  ["pantry", "płatki owsiane", "płatki owsiane górskie"],
  ["pantry", "płatki", "płatki owsiane 500 g"],
  // Vegetables, potatoes, canned
  ["vegetables", "ziemniaki", "ziemniaki"],
  ["vegetables", "cebula", "cebula"],
  ["vegetables", "cebula", "cebula czerwona"],
  ["vegetables", "ogórek", "ogórek"],
  ["vegetables", "papryka", "papryka"],
  ["vegetables", "papryka", "papryka czerwona"],
  ["vegetables", "pieczarki", "pieczarki"],
  ["vegetables", "pomidor", "pomidor"],
  ["vegetables", "pomidor", "pomidory koktajlowe"],
  ["canned", "passata", "passata"],
  ["canned", "passata", "pomidory krojone"],
  ["canned", "kukurydza", "kukurydza konserwowa"],
  ["canned", "fasola", "fasola czerwona"],
  ["canned", "fasola", "fasola biała"],
  ["canned", "salsa", "salsa"],
  ["canned", "mleko kokosowe light", "mleko kokosowe light"],
  ["canned", "mleko kokosowe light", "mleko kokosowe"],
  // Fruit and frozen
  ["fruit", "banan", "banan"],
  ["fruit", "jabłko", "jabłko"],
  ["frozen", "owoce mrożone", "owoce mrożone"],
  ["frozen", "owoce mrożone", "truskawki mrożone"],
  ["frozen", "owoce mrożone", "maliny mrożone"],
  ["fruit", "owoce mrożone", "borówki"],
  // Oils
  ["oils", "oliwa", "oliwa z oliwek"],
  ["oils", "oliwa", "oliwa z oliwek extra virgin"],
  ["oils", "oliwa", "oliwa z oliwek 500 ml"],
  // Pantry: spreads, sauces, spices, supplements
  ["pantry", "masło orzechowe", "masło orzechowe"],
  ["pantry", "pb", "masło orzechowe kremowe"],
  ["pantry", "miód", "miód"],
  ["pantry", "miód", "miód wielokwiatowy"],
  ["pantry", "kakao", "kakao"],
  ["pantry", "cynamon", "cynamon"],
  ["pantry", "curry", "curry"],
  ["pantry", "musztarda", "musztarda"],
  ["pantry", "nasiona chia", "nasiona chia"],
  ["pantry", "pesto", "pesto"],
  ["pantry", "sos bbq", "sos bbq"],
  ["pantry", "sos sojowy", "sos sojowy"],
  ["pantry", "sos sweet chilli", "sos sweet chilli"],
  ["pantry", "teriyaki", "sos teriyaki"],
  ["pantry", "pudding proteinowy", "pudding proteinowy"],
  ["pantry", "whey", "whey"],
];

type Need = { id: number; category: string; ingredient: string; product: string; name: string; unit: Unit; pack: Quantity | null };

function needOf(index: number, [category, ingredient, product]: (typeof PRODUCTS)[number], units: Map<string, Unit | null>): Need {
  const pack = parseQuantity(product);
  const name = product.replace(/\s*\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|szt\.?)\s*$/i, "").trim();
  const sheetUnit = units.get(ingredient) ?? null;
  const unit: Unit = pack?.unit ?? (sheetUnit === "ml" ? "ml" : sheetUnit ?? (/jaj/.test(fold(name)) ? "szt" : /oliwa|sos sojowy|mleko/.test(fold(name)) ? "ml" : "g"));
  return { id: index + 1, category, ingredient, product, name, unit, pack };
}

/* 3. Matching helpers ------------------------------------------------------- */

type Hit = { tier: MatchTier; name: string; pack: Quantity | null; exactPack: boolean | null };

function judge(need: Need, name: string, pack: Quantity | null, gtin?: string | null, needGtin?: string | null): Hit {
  const result = matchCandidate({ name: need.name, unit: need.unit, gtin: needGtin ?? null }, { name, pack, gtin: gtin ?? null });
  const exactPack = need.pack ? (pack ? pack.unit === need.pack.unit && Math.abs(pack.amount - need.pack.amount) < 0.5 : false) : null;
  return { tier: result.tier, name, pack, exactPack };
}

const usable = (tier: MatchTier) => tier === "gtin" || tier === "listing" || tier === "attributes" || tier === "category";
const exact = (tier: MatchTier) => tier === "gtin" || tier === "listing" || tier === "attributes";

/* Main ------------------------------------------------------------------------ */

const startedAt = Date.now();
const sheet = await loadSheet();
const rows = parseCsv(sheet.csv);
const header = rows.findIndex((row) => row.includes("Składniki i gramatura"));
const column = rows[header].indexOf("Składniki i gramatura");
const ingredients = aggregateIngredients(rows.slice(header + 1).flatMap((row) => (row[column] ? [{ text: row[column], portions: 1 }] : [])));
const units = new Map(ingredients.map((one) => [one.name, one.unit]));
const missingIngredients = [...new Set(PRODUCTS.map(([, ingredient]) => ingredient))].filter((name) => !units.has(name));
if (PRODUCTS.length !== 100) throw new Error(`Expected 100 products, have ${PRODUCTS.length}`);
const needs = PRODUCTS.map((entry, index) => needOf(index, entry, units));
console.log(`library: ${sheet.source}, ${ingredients.length} ingredients; products: ${needs.length}; not in library: ${missingIngredients.join(", ") || "none"}`);

// Open Prices: every PLN price, Poland gate.
const openPrices = await fetchOpenPrices(null, TODAY, { maxPages: 40, userAgent: UA });
console.log(`open prices: ${openPrices.records.length} Polish records kept of ${openPrices.total}, ${openPrices.pagesRead} pages, rejected ${JSON.stringify(openPrices.rejected)}`);

// Frisco: the whole feed, in stock only.
let frisco: FriscoItem[] = [];
let friscoError: string | null = null;
try {
  frisco = (await fetchFriscoFeed()).filter((item) => item.inStock);
} catch (error) {
  friscoError = error instanceof Error ? error.message : String(error);
}
console.log(`frisco: ${frisco.length} in-stock products${friscoError ? ` (error: ${friscoError})` : ""}`);
const friscoCatalog = frisco.map((product) => ({ name: matchName(product), product }));

type ProductResult = Need & {
  off: { searched: boolean; results: number; best: (Hit & { gtin: string; url: string }) | null; error: string | null; retried: boolean };
  openPrices: {
    poland: number;
    warsaw: number;
    warsaw90: number;
    byRetailer90: Record<string, number>;
    proofs: Record<string, number>;
    newest: string | null;
    gtinExact: number;
    example: { name: string; store: string; date: string; priceGrosz: number; url: string; tier: MatchTier } | null;
  };
  frisco: (Hit & { priceGrosz: number; perUnit: string | null; url: string; sku: string; state: string }) | null;
  lidlEveryday: (Hit & { priceGrosz: number; state: string }) | null;
};

const results: ProductResult[] = [];
for (const need of needs) {
  // Open Food Facts: who is this product (a barcode), searched in Poland.
  const off: ProductResult["off"] = { searched: false, results: 0, best: null, error: null, retried: false };
  const earlierOff = reused?.byProduct.get(need.product) as ProductResult["off"] | undefined;
  if (earlierOff) {
    Object.assign(off, earlierOff);
  } else if (!SKIP_OFF) {
    off.searched = true;
    try {
      let found: OffProduct[];
      try {
        found = await searchOffProducts(need.name, UA, 10);
      } catch (error) {
        // Its search answers 503 now and then under load: one retry, 20 s later, never more.
        if (!(error instanceof Error && /5\d\d|połączyć/.test(error.message))) throw error;
        off.retried = true;
        await new Promise((resolve) => setTimeout(resolve, 20_000));
        found = await searchOffProducts(need.name, UA, 10);
      }
      off.results = found.length;
      const judged = found
        .map((product) => ({ ...judge(need, product.name, product.pack), gtin: product.gtin, url: product.url }))
        .filter((hit) => usable(hit.tier))
        .sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || Number(b.exactPack) - Number(a.exactPack));
      off.best = judged[0] ?? null;
    } catch (error) {
      off.error = error instanceof Error ? error.message : String(error);
    }
  }

  // Open Prices: observations of this product in Poland, Warsaw, the last 90 days.
  const opMatches: { record: OpenPricesRecord; tier: MatchTier }[] = [];
  for (const record of openPrices.records) {
    const hit = judge(need, record.productName, record.pack, record.gtin, off.best?.gtin ?? null);
    if (usable(hit.tier)) opMatches.push({ record, tier: hit.tier });
  }
  const warsaw = opMatches.filter(({ record }) => fold(record.store.city ?? "") === "warszawa");
  const recent = warsaw.filter(({ record }) => assessPrice(openPricesFact(record), ctx).usable);
  const byRetailer90: Record<string, number> = {};
  for (const { record } of recent) {
    const key = record.store.retailer ?? "other";
    byRetailer90[key] = (byRetailer90[key] ?? 0) + 1;
  }
  const proofs: Record<string, number> = {};
  for (const { record } of opMatches) proofs[record.proofType ?? "none"] = (proofs[record.proofType ?? "none"] ?? 0) + 1;
  const newest = opMatches.reduce<string | null>((latest, { record }) => (!latest || record.observedOn > latest ? record.observedOn : latest), null);
  const example = [...recent].sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || b.record.observedOn.localeCompare(a.record.observedOn))[0] ?? null;

  // Frisco (verified current, online): the best match with a price.
  let friscoBest: ProductResult["frisco"] = null;
  for (const { product } of catalogCandidates(need.name, need.unit, friscoCatalog, 60)) {
    const shelf = toFriscoShelfPrice(product);
    if (!shelf) continue;
    const pack = { amount: shelf.packQuantity, unit: shelf.packUnit };
    const hit = judge(need, product.name, pack);
    if (!usable(hit.tier)) continue;
    const priceGrosz = Math.round(product.price * 100);
    const better =
      !friscoBest ||
      tierRank(hit.tier) < tierRank(friscoBest.tier) ||
      (tierRank(hit.tier) === tierRank(friscoBest.tier) && Number(hit.exactPack) > Number(friscoBest.exactPack));
    if (better) {
      const promo: ShopPromo = {
        shop: "frisco", productKey: shelf.productKey, name: shelf.name, packQuantity: shelf.packQuantity, packUnit: shelf.packUnit,
        loose: shelf.loose, promoPrice: shelf.price, regularPrice: null, validFrom: TODAY, validTo: null, conditions: "",
        appOnly: false, multibuy: null, multibuyMin: 1, sourceUrl: shelf.sourceUrl, shelf: true, fetchedAt: NOW,
      };
      const per = unitPrice(priceGrosz, pack);
      friscoBest = {
        ...hit,
        priceGrosz,
        perUnit: per ? `${(per.grosz / 100).toFixed(2)} zł/${per.per}` : null,
        url: product.url,
        sku: product.productKey,
        state: assessPrice(factFromPromo(promo), ctx).state,
      };
    }
  }

  // Lidl's published everyday prices.
  let lidl: ProductResult["lidlEveryday"] = null;
  for (const promo of LIDL_EVERYDAY) {
    const hit = judge(need, promo.name, { amount: promo.packQuantity!, unit: promo.packUnit! });
    if (!usable(hit.tier)) continue;
    if (!lidl || tierRank(hit.tier) < tierRank(lidl.tier)) {
      lidl = { ...hit, priceGrosz: Math.round(promo.promoPrice * 100), state: assessPrice(factFromPromo(promo), ctx).state };
    }
  }

  results.push({
    ...need,
    off,
    openPrices: {
      poland: opMatches.length,
      warsaw: warsaw.length,
      warsaw90: recent.length,
      byRetailer90,
      proofs,
      newest,
      gtinExact: opMatches.filter(({ tier }) => tier === "gtin").length,
      example: example
        ? {
            name: example.record.productName,
            store: example.record.store.name,
            date: example.record.observedOn,
            priceGrosz: example.record.amountGrosz,
            url: example.record.url,
            tier: example.tier,
          }
        : null,
    },
    frisco: friscoBest,
    lidlEveryday: lidl,
  });
  process.stdout.write(`${need.id} `);
}
console.log();

/* 4. Basket: the real library's ingredient list, through the app's own pricing ------------------------------ */

const weekItems = ingredients
  .filter((one) => one.quantity !== null)
  .map((one, index) => ({ id: String(index), name: one.name, quantity: one.quantity, unit: one.unit }));
const friscoPromos: ShopPromo[] = frisco.flatMap((product) => {
  const shelf = toFriscoShelfPrice(product);
  return shelf
    ? [{ shop: "frisco" as const, productKey: shelf.productKey, name: matchName(product), packQuantity: shelf.packQuantity, packUnit: shelf.packUnit, loose: shelf.loose, promoPrice: shelf.price, regularPrice: null, validFrom: TODAY, validTo: null, conditions: "", appOnly: false, multibuy: null, multibuyMin: 1, sourceUrl: shelf.sourceUrl, shelf: true, fetchedAt: NOW }]
    : [];
});
const historyPromos: ShopPromo[] = openPrices.records.flatMap((record) => {
  const shop = record.store.retailer ? retailerById(record.store.retailer)?.shop : null;
  if (!shop || record.priceType === "clearance") return [];
  return [{ shop, productKey: record.recordId, name: record.productName, packQuantity: record.per === "kg" ? 1000 : (record.pack?.amount ?? null), packUnit: record.per === "kg" ? "g" : (record.pack?.unit ?? null), loose: record.per === "kg", promoPrice: record.amountGrosz / 100, regularPrice: null, validFrom: record.observedOn, validTo: null, conditions: "", appOnly: false, multibuy: null, multibuyMin: 1, sourceUrl: record.url, fetchedAt: `${record.observedOn}T12:00:00Z`, historical: "community" as const, city: record.store.city }];
});
const allPromos = [...friscoPromos, ...LIDL_EVERYDAY, ...historyPromos];
const byShop = new Map<string, ShopPromo[]>();
for (const promo of allPromos) byShop.set(promo.shop, [...(byShop.get(promo.shop) ?? []), promo]);
const basket = assessAll(weekItems, (shop, item) => matchPromos(item, byShop.get(shop) ?? [], []), () => null, { ...ctx });
const verdict = verifiedVerdict(basket.strict, []);

/* 5. Summary ------------------------------------------------------------------ */

const count = (predicate: (one: ProductResult) => boolean) => results.filter(predicate).length;
const byCategory = (predicate: (one: ProductResult) => boolean) =>
  Object.fromEntries([...new Set(results.map((one) => one.category))].map((category) => [category, `${count((one) => one.category === category && predicate(one))}/${count((one) => one.category === category)}`]));
const priority = ["biedronka", "lidl", "kaufland", "auchan", "carrefour"];
const summary = {
  date: TODAY,
  generatedAt: NOW,
  offSource: reused ? `reused from the run of ${reused.generatedAt} (${REUSE_OFF?.split("/").pop()})` : SKIP_OFF ? "skipped" : "searched live",
  library: sheet.source,
  libraryIngredients: ingredients.length,
  products: results.length,
  offSearched: count((one) => one.off.searched),
  offRetried: count((one) => one.off.retried),
  offErrors: count((one) => one.off.error !== null),
  offAnyResult: count((one) => one.off.results > 0),
  offExactProduct: count((one) => one.off.best !== null && exact(one.off.best.tier)),
  offCategoryOnly: count((one) => one.off.best !== null && one.off.best.tier === "category"),
  offExactPack: count((one) => one.pack !== null && one.off.best?.exactPack === true),
  productsWithPack: count((one) => one.pack !== null),
  openPricesPolishRecords: openPrices.records.length,
  openPricesRejected: openPrices.rejected,
  openPricesPoland: count((one) => one.openPrices.poland > 0),
  openPricesWarsaw: count((one) => one.openPrices.warsaw > 0),
  openPricesWarsaw90: count((one) => one.openPrices.warsaw90 > 0),
  openPricesGtinExact: count((one) => one.openPrices.gtinExact > 0),
  openPricesWarsaw90ByRetailer: Object.fromEntries(
    [...priority, "stokrotka", "zabka", "other"].map((retailer) => [retailer, count((one) => (one.openPrices.byRetailer90[retailer] ?? 0) > 0)]),
  ),
  friscoInStock: frisco.length,
  friscoError,
  friscoVerifiedExact: count((one) => one.frisco !== null && one.frisco.state === "verified_current" && exact(one.frisco.tier)),
  friscoAnyMatch: count((one) => one.frisco !== null),
  friscoExactPack: count((one) => one.pack !== null && one.frisco?.exactPack === true),
  lidlPublishedExact: count((one) => one.lidlEveryday !== null && one.lidlEveryday.state === "published_promotion" && exact(one.lidlEveryday.tier)),
  // Strict (verdict-eligible) prices per priority chain: only Lidl has any, its published everyday prices.
  strictByPriorityRetailer: Object.fromEntries(
    priority.map((retailer) => [retailer, retailer === "lidl" ? count((one) => one.lidlEveryday !== null && one.lidlEveryday.state === "published_promotion" && exact(one.lidlEveryday.tier)) : 0]),
  ),
  byCategory: {
    offExact: byCategory((one) => one.off.best !== null && exact(one.off.best.tier)),
    openPricesWarsaw90: byCategory((one) => one.openPrices.warsaw90 > 0),
    friscoVerifiedExact: byCategory((one) => one.frisco !== null && one.frisco.state === "verified_current" && exact(one.frisco.tier)),
  },
  basket: {
    items: weekItems.length,
    strictCoverage: verdict.coverage.slice(0, 5).map((one) => ({ shop: one.shop, priced: one.priced, missing: one.missing })),
    complete: verdict.complete.map((one) => ({ shop: one.shop, totalGrosz: one.totalGrosz, goodsGrosz: one.goodsGrosz })),
    verdict: verdict.complete.length > 0 ? "complete basket found" : CANNOT_DETERMINE,
    referenceCoverage: basket.reference.shops
      .filter((shop) => shop.priced > 0)
      .sort((a, b) => b.priced - a.priced)
      .slice(0, 6)
      .map((shop) => ({ shop: shop.shop, priced: shop.priced, states: shop.states })),
  },
  notRun: {
    "lidl-web, blix, biedronka-online, auchan-online, stokrotka-feed":
      "blocked by policy: no permission on record for these sources (GROCERY_UNVERIFIED_SOURCES off)",
    "gs1-eprodukty": "blocked: no subscription or credentials",
    "kaufland, carrefour, dino, aldi, netto online catalogues": "no authorized source exists",
  },
  seconds: Math.round((Date.now() - startedAt) / 1000),
};

mkdirSync(OUT, { recursive: true });
writeFileSync(new URL(`warsaw-pilot-${TODAY}.json`, OUT), JSON.stringify({ summary, results }, null, 1));

// CSV in the research package's columns: one row per product and source with a match.
const csvRows: string[][] = [];
const head = ["ingredient_id", "recipe_ingredient", "product", "required", "retailer", "store", "channel", "gtin", "retailer_sku", "package_size", "price_grosz", "observed_at", "valid_until", "evidence_url", "license_status", "match_status", "current_offer_eligible", "reviewer", "review_date"];
for (const one of results) {
  const required = one.pack ? `${one.pack.amount} ${one.pack.unit}` : one.unit;
  if (one.frisco) csvRows.push([String(one.id), one.ingredient, one.product, required, "frisco", "online Warszawa", "online", "", one.frisco.sku, one.frisco.pack ? `${one.frisco.pack.amount} ${one.frisco.pack.unit}` : "", String(one.frisco.priceGrosz), NOW, "", one.frisco.url, "personal non-commercial (robots.txt)", one.frisco.tier, String(one.frisco.state === "verified_current" && exact(one.frisco.tier)), "", ""]);
  if (one.lidlEveryday) csvRows.push([String(one.id), one.ingredient, one.product, required, "lidl", "national", "store", "", "", one.lidlEveryday.pack ? `${one.lidlEveryday.pack.amount} ${one.lidlEveryday.pack.unit}` : "", String(one.lidlEveryday.priceGrosz), "2026-10-20", "2026-12-31", "https://www.lidl.pl/l/pl/gazetki/rewolucja-cenowa-oszczedzaj-kazdego-dnia-16092026/ar/0", "user transcription of retailer publication", one.lidlEveryday.tier, String(one.lidlEveryday.state === "published_promotion" && exact(one.lidlEveryday.tier)), "", ""]);
  if (one.openPrices.example) csvRows.push([String(one.id), one.ingredient, one.product, required, "open-prices", one.openPrices.example.store, "store", "", "", "", String(one.openPrices.example.priceGrosz), one.openPrices.example.date, "", one.openPrices.example.url, "ODbL", one.openPrices.example.tier, "false", "", ""]);
  if (one.off.best) csvRows.push([String(one.id), one.ingredient, one.product, required, "open-food-facts", "", "", canonicalGtin(one.off.best.gtin) ?? "", "", one.off.best.pack ? `${one.off.best.pack.amount} ${one.off.best.pack.unit}` : "", "", "", "", one.off.best.url, "ODbL", one.off.best.tier, "false", "", ""]);
}
const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
writeFileSync(new URL(`warsaw-pilot-${TODAY}.csv`, OUT), [head, ...csvRows].map((row) => row.map(escape).join(",")).join("\n"));

console.log(JSON.stringify(summary, null, 1));
