/**
 * Every source of product or price data, with what it is allowed to be used
 * for. This is policy, reviewed in code: changing a provider's authorization
 * is a commit with the evidence next to it. Pure, client-safe.
 *
 * Rules that follow from it (`eligibility.ts`, `policy.ts`):
 * - a price counts as verified only from a provider whose authorization for
 *   this app's use is "granted" (or the user's own data, as history);
 * - a provider whose authorization is "unverified" is not read in production
 *   unless the owner turns those sources on, and even then its prices are
 *   labelled unverified and never enter the verified verdict;
 * - "not_configured" providers (a contract or credentials we do not have)
 *   never run.
 */

import type { RetailerId } from "./retailers.ts";

/**
 * How this deployment uses the data. MealPrep is one person's private app
 * (CLAUDE.md), so "personal". A public or commercial deployment must change
 * this, which turns off every source granted for personal use only.
 */
export const APP_USE: "personal" | "commercial" = "personal";

export type AuthorizationStatus =
  /** Written permission or a licence covers this use. */
  | "granted"
  /** An open-data licence covers it, with obligations (attribution, share-alike). */
  | "open_license"
  /** The user's own data: prices typed, receipts, a leaflet transcribed by hand. */
  | "user_provided"
  /** Technically reachable, but no permission is on record. */
  | "unverified"
  /** Needs a contract or credentials this deployment does not have. */
  | "not_configured";

export type Capability =
  | "product_metadata"
  | "current_prices"
  | "promotions"
  | "historical_prices"
  | "store_locations"
  | "receipts";

export type ProviderKind =
  | "open_data"
  | "retailer_feed"
  | "retailer_web"
  | "aggregator_web"
  | "manual"
  | "registry"
  | "licensed";

export const PROVIDER_IDS = [
  "open-food-facts",
  "open-prices",
  "gs1-eprodukty",
  "frisco-feed",
  "stokrotka-feed",
  "lidl-web",
  "lidl-everyday",
  "blix",
  "biedronka-online",
  "auchan-online",
  "user-prices",
  "receipts",
  "licensed-feed",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type Provider = {
  id: ProviderId;
  name: string;
  kind: ProviderKind;
  /** The chains whose data it carries. */
  retailers: RetailerId[];
  access: string;
  docsUrl: string | null;
  authentication: string;
  capabilities: Capability[];
  identifiers: ("gtin" | "retailer_sku" | "name")[];
  geography: string;
  channel: "store" | "online" | "both" | null;
  authorization: {
    personal: AuthorizationStatus;
    commercial: AuthorizationStatus;
    /** May the data be shown or passed on to other people. */
    redistribution: AuthorizationStatus;
    /** What the status rests on, quoted where possible. */
    evidence: string;
    /** YYYY-MM-DD the evidence was last checked. */
    checked: string;
  };
  license: string | null;
  /** What has to be shown next to the data. */
  attribution: string | null;
  refresh: string;
  rateLimit: string;
  limitations: string[];
  /** Product-key prefixes this provider's rows carry in shop_promos / shelf_prices / grocery_prices. */
  keyPrefixes: string[];
  testStatus: string;
};

const CHECKED = "2026-10-20";

export const PROVIDERS: Provider[] = [
  {
    id: "open-food-facts",
    name: "Open Food Facts",
    kind: "open_data",
    retailers: [],
    access: "Documented REST API (product by barcode, structured search) and bulk exports",
    docsUrl: "https://openfoodfacts.github.io/openfoodfacts-server/api/",
    authentication: "None for reading; a custom User-Agent is required",
    capabilities: ["product_metadata"],
    identifiers: ["gtin"],
    geography: "World; country tags are not proof of Polish availability",
    channel: null,
    authorization: {
      personal: "open_license",
      commercial: "open_license",
      redistribution: "open_license",
      evidence: "Database under ODbL, contents under DbCL, images CC BY-SA (API documentation).",
      checked: CHECKED,
    },
    license: "ODbL 1.0 (database), DbCL (contents), CC BY-SA (images)",
    attribution: "Dane produktu: Open Food Facts (ODbL)",
    refresh: "On demand per barcode, cached 30 days",
    rateLimit: "15 product reads/min/IP, 10 searches/min/IP; bulk export above a few hundred products",
    limitations: [
      "Metadata only: no prices, no proof a product is sold in Poland.",
      "Community-entered: names, packs and categories can be wrong or missing.",
    ],
    keyPrefixes: [],
    testStatus: "Parser tested on recorded v2/v3 responses (fixtures 20.10.2026).",
  },
  {
    id: "open-prices",
    name: "Open Prices",
    kind: "open_data",
    retailers: ["lidl", "biedronka", "carrefour", "stokrotka", "zabka", "auchan", "kaufland", "dino", "aldi", "netto"],
    access: "Documented REST API (/api/v1/prices) and daily JSONL/Parquet exports",
    docsUrl: "https://prices.openfoodfacts.org/api/docs",
    authentication: "None for reading",
    capabilities: ["historical_prices", "store_locations"],
    identifiers: ["gtin", "name"],
    geography: "World; filtered here to PLN prices at shops in Poland",
    channel: "store",
    authorization: {
      personal: "open_license",
      commercial: "open_license",
      redistribution: "open_license",
      evidence: "Exports and API data under ODbL; the source must be mentioned (data guide).",
      checked: CHECKED,
    },
    license: "ODbL 1.0",
    attribution: "Ceny społeczności: Open Prices (Open Food Facts), ODbL",
    refresh: "Daily, incremental by date",
    rateLimit: "Not documented: sequential pages of 100, once a day",
    limitations: [
      "Historical observations from receipts and price tags, not current shelf prices.",
      "The prices endpoint has no country filter; unknown parameters are ignored, so Poland is enforced in code.",
      "Sparse: about 2,200 Polish prices in October 2026, mostly a few Warsaw shops.",
    ],
    keyPrefixes: ["openprices:"],
    testStatus: "Parser and Poland gate tested on a recorded Warsaw response (20.10.2026).",
  },
  {
    id: "gs1-eprodukty",
    name: "GS1 Polska eProdukty",
    kind: "registry",
    retailers: [],
    access: "Subscription platform (web, CSV, API) for GTIN verification",
    docsUrl: "https://eprodukty.gs1.pl/",
    authentication: "Account and subscription; API details are given to subscribers",
    capabilities: ["product_metadata"],
    identifiers: ["gtin"],
    geography: "GTINs registered worldwide, Polish brand owners",
    channel: null,
    authorization: {
      personal: "not_configured",
      commercial: "not_configured",
      redistribution: "not_configured",
      evidence:
        "No subscription or credentials. Pricing page not re-readable on 20.10.2026 (TLS error, then 503); research package cites May 2025 tiers.",
      checked: CHECKED,
    },
    license: "Contract (terms of the subscription)",
    attribution: null,
    refresh: "-",
    rateLimit: "Per subscription tier",
    limitations: ["Disabled placeholder: no endpoint is called and none is guessed."],
    keyPrefixes: [],
    testStatus: "Placeholder only; refuses to run without configuration (tested).",
  },
  {
    id: "frisco-feed",
    name: "Frisco (product feed)",
    kind: "retailer_feed",
    retailers: ["frisco"],
    access: "Public product feed linked from frisco.pl/robots.txt",
    docsUrl: "https://www.frisco.pl/robots.txt",
    authentication: "None",
    capabilities: ["current_prices"],
    identifiers: ["retailer_sku", "name"],
    geography: "Frisco delivery towns (Warszawa among them)",
    channel: "online",
    authorization: {
      personal: "granted",
      commercial: "unverified",
      redistribution: "unverified",
      evidence:
        'frisco.pl/robots.txt: "If you want to crawl our product database for personal, non-commercial use, please be polite and do not do it manually. Instead you can access following link to get precomputed, kept up-to-date full product feed."',
      checked: CHECKED,
    },
    license: "Personal, non-commercial use (robots.txt statement)",
    attribution: "Ceny: frisco.pl",
    refresh: "Every 12 h",
    rateLimit: "One request per refresh (~57 MB)",
    limitations: [
      "Online prices with delivery; not a price in any physical shop.",
      "Only for personal, non-commercial use: a public deployment must stop using it.",
    ],
    keyPrefixes: ["frisco:"],
    testStatus: "Parser tested on a recorded feed excerpt (19.10.2026).",
  },
  {
    id: "stokrotka-feed",
    name: "Stokrotka (Google Merchant feed)",
    kind: "retailer_feed",
    retailers: ["stokrotka"],
    access: "Google Merchant XML feed of the online shop",
    docsUrl: "https://sklep.stokrotka.pl/robots.txt",
    authentication: "None",
    capabilities: ["current_prices"],
    identifiers: ["retailer_sku", "name"],
    geography: "Stokrotka online delivery towns",
    channel: "online",
    authorization: {
      personal: "unverified",
      commercial: "unverified",
      redistribution: "unverified",
      evidence: "robots.txt allows /xml/google_products.xml for every crawler; that permits crawling, it is not a licence.",
      checked: CHECKED,
    },
    license: null,
    attribution: "Ceny: sklep.stokrotka.pl",
    refresh: "Every 12 h",
    rateLimit: "One request per refresh (~40 s)",
    limitations: ["Feed meant for Google Shopping; reuse terms unknown.", "Online prices only."],
    keyPrefixes: ["stokrotka:"],
    testStatus: "Parser tested on a recorded feed excerpt (19.10.2026).",
  },
  {
    id: "lidl-web",
    name: "lidl.pl (promotions)",
    kind: "retailer_web",
    retailers: ["lidl"],
    access: "The JSON search endpoint lidl.pl's own pages load (undocumented)",
    docsUrl: null,
    authentication: "None",
    capabilities: ["promotions"],
    identifiers: ["retailer_sku", "name"],
    geography: "Poland (one national price region)",
    channel: "store",
    authorization: {
      personal: "unverified",
      commercial: "unverified",
      redistribution: "unverified",
      evidence: "Undocumented internal endpoint; robots.txt does not disallow the path used. No permission on record.",
      checked: CHECKED,
    },
    license: null,
    attribution: "Promocje: lidl.pl",
    refresh: "On tap and daily",
    rateLimit: "One request per refresh",
    limitations: ["About 30 featured deals, not the whole leaflet.", "Lidl Plus prices need the app."],
    keyPrefixes: ["lidl:"],
    testStatus: "Parser tested on a recorded response (19.10.2026).",
  },
  {
    id: "lidl-everyday",
    name: "Lidl, everyday prices (leaflet, typed by hand)",
    kind: "manual",
    retailers: ["lidl"],
    access: "Prices read off the pages of Lidl's leaflet 'Rewolucja cenowa' and typed in code",
    docsUrl: "https://www.lidl.pl/l/pl/gazetki/rewolucja-cenowa-oszczedzaj-kazdego-dnia-16092026/ar/0",
    authentication: "None",
    capabilities: ["current_prices"],
    identifiers: ["name"],
    geography: "Poland (Lidl's prices are national)",
    channel: "store",
    authorization: {
      personal: "user_provided",
      commercial: "unverified",
      redistribution: "unverified",
      evidence: "A retailer's own publication, transcribed by the owner on 20.10.2026 for personal use.",
      checked: CHECKED,
    },
    license: null,
    attribution: "Stała cena Lidla (gazetka „Rewolucja cenowa”)",
    refresh: "By hand when the leaflet changes (ends 31.12.2026)",
    rateLimit: "-",
    limitations: ["52 products only.", "Typed by hand: a typo is possible."],
    keyPrefixes: ["lidl-everyday:"],
    testStatus: "Rows tested for shape and validity dates.",
  },
  {
    id: "blix",
    name: "Blix (leaflets of 11 chains)",
    kind: "aggregator_web",
    retailers: ["lidl", "biedronka", "kaufland", "aldi", "netto", "dino", "carrefour", "auchan", "stokrotka", "zabka", "leclerc"],
    access: "blix.pl product pages as JSON (?async=1), undocumented",
    docsUrl: "https://grupablix.pl/wspolpraca/",
    authentication: "None",
    capabilities: ["promotions"],
    identifiers: ["name"],
    geography: "Poland (national leaflets)",
    channel: "store",
    authorization: {
      personal: "unverified",
      commercial: "unverified",
      redistribution: "unverified",
      evidence: "robots.txt blocks only /api/* and shopping lists; Grupa Blix sells data partnerships. No permission on record.",
      checked: CHECKED,
    },
    license: null,
    attribution: "Gazetki: blix.pl",
    refresh: "On tap; full sweep at most every 12 h",
    rateLimit: "3-4 requests in parallel, ~150 pages per sweep",
    limitations: [
      "Leaflet offers name no pack and no validity dates (assumed 6 days).",
      "Conditions (app, card, multi-buy) are often not in the text.",
    ],
    keyPrefixes: ["blix:"],
    testStatus: "Parser tested on recorded responses (19.10.2026).",
  },
  {
    id: "biedronka-online",
    name: "Biedronka online shop",
    kind: "retailer_web",
    retailers: ["biedronka"],
    access: "Sitemap, product and category pages of zakupy.biedronka.pl (HTML)",
    docsUrl: null,
    authentication: "None",
    capabilities: ["current_prices"],
    identifiers: ["retailer_sku", "name"],
    geography: "Biedronka online delivery towns",
    channel: "online",
    authorization: {
      personal: "unverified",
      commercial: "unverified",
      redistribution: "unverified",
      evidence: "robots.txt blocks search and filters, not product pages. No permission on record.",
      checked: CHECKED,
    },
    license: null,
    attribution: "Ceny: zakupy.biedronka.pl",
    refresh: "Product pages 14 days, category pages 3 days",
    rateLimit: "3 requests in parallel, at most 45 product / 60 category pages per tap",
    limitations: ["Online prices; a shop on the corner can differ.", "Out-of-stock pack prices are derived from the per-kilo price."],
    keyPrefixes: ["biedronka:"],
    testStatus: "Parsers tested on recorded pages (19-20.10.2026).",
  },
  {
    id: "auchan-online",
    name: "Auchan online shop",
    kind: "retailer_web",
    retailers: ["auchan"],
    access: "Category pages of zakupy.auchan.pl (state embedded in HTML)",
    docsUrl: "https://datasharing.auchan.pl/",
    authentication: "None",
    capabilities: ["current_prices"],
    identifiers: ["retailer_sku", "name"],
    geography: "Auchan online delivery towns",
    channel: "online",
    authorization: {
      personal: "unverified",
      commercial: "unverified",
      redistribution: "unverified",
      evidence: "robots.txt blocks /api/, /search, /offers, not category pages; 202 = slow down, respected. Auchan runs a DataSharing programme; no permission on record.",
      checked: CHECKED,
    },
    license: null,
    attribution: "Ceny: zakupy.auchan.pl",
    refresh: "3 days per category page",
    rateLimit: "2 requests in parallel, at most 40 pages per tap, stops at the first 202",
    limitations: ["Online prices.", "Pack sometimes derived as price ÷ unit price."],
    keyPrefixes: ["auchan:"],
    testStatus: "Parser tested on a recorded page (20.10.2026).",
  },
  {
    id: "user-prices",
    name: "Twoje ceny",
    kind: "manual",
    retailers: [],
    access: "Typed by the owner on the shopping screen",
    docsUrl: null,
    authentication: "-",
    capabilities: ["historical_prices"],
    identifiers: ["name"],
    geography: "Wherever the owner shops",
    channel: "store",
    authorization: {
      personal: "user_provided",
      commercial: "user_provided",
      redistribution: "user_provided",
      evidence: "The owner's own observation.",
      checked: CHECKED,
    },
    license: null,
    attribution: "Twoja cena",
    refresh: "When typed",
    rateLimit: "-",
    limitations: ["A price seen once; it can be out of date."],
    keyPrefixes: [],
    testStatus: "Covered by basket tests.",
  },
  {
    id: "receipts",
    name: "Twoje paragony",
    kind: "manual",
    retailers: [],
    access: "Receipt text pasted or typed by the owner, reviewed line by line",
    docsUrl: null,
    authentication: "-",
    capabilities: ["historical_prices", "receipts"],
    identifiers: ["gtin", "name"],
    geography: "The shop on the receipt",
    channel: "store",
    authorization: {
      personal: "user_provided",
      commercial: "user_provided",
      redistribution: "user_provided",
      evidence: "The owner's own purchases; shared only line by line with explicit consent.",
      checked: CHECKED,
    },
    license: null,
    attribution: "Z Twojego paragonu",
    refresh: "When saved",
    rateLimit: "-",
    limitations: ["Historical: what was paid that day, not today's price."],
    keyPrefixes: ["receipt:"],
    testStatus: "Receipt parser, redaction and contribution tests.",
  },
  {
    id: "licensed-feed",
    name: "Licensed partner feed (template)",
    kind: "licensed",
    retailers: [],
    access: "CSV or JSON delivered by a data partner under contract (schema in licensed-feed.ts)",
    docsUrl: null,
    authentication: "Per contract",
    capabilities: ["current_prices", "promotions"],
    identifiers: ["gtin", "retailer_sku"],
    geography: "Per contract",
    channel: "both",
    authorization: {
      personal: "not_configured",
      commercial: "not_configured",
      redistribution: "not_configured",
      evidence: "No partner contract yet. A partner becomes its own entry here, with the licence reference.",
      checked: CHECKED,
    },
    license: "Per contract",
    attribution: null,
    refresh: "Per contract",
    rateLimit: "Per contract",
    limitations: ["Template: imports nothing until a partner and its licence are registered."],
    keyPrefixes: ["licensed:"],
    testStatus: "Schema and import validation tested on a synthetic test file.",
  },
];

const BY_ID = new Map(PROVIDERS.map((provider) => [provider.id, provider]));

export function providerById(id: string): Provider | null {
  return BY_ID.get(id as ProviderId) ?? null;
}

/** The authorization for the way this deployment uses data. */
export function authorizationFor(provider: Provider, use: typeof APP_USE = APP_USE): AuthorizationStatus {
  return use === "personal" ? provider.authorization.personal : provider.authorization.commercial;
}

/** Prices from it may be called verified (current, from a permitted source). */
export function grantsVerifiedPrices(provider: Provider, use: typeof APP_USE = APP_USE): boolean {
  return (
    authorizationFor(provider, use) === "granted" &&
    (provider.capabilities.includes("current_prices") || provider.capabilities.includes("promotions"))
  );
}

/**
 * The provider a stored price belongs to, by its product-key prefix. The
 * longest prefix wins ("lidl-everyday:" before "lidl:").
 */
export function providerForKey(productKey: string): Provider | null {
  let best: { provider: Provider; length: number } | null = null;
  for (const provider of PROVIDERS) {
    for (const prefix of provider.keyPrefixes) {
      if (productKey.startsWith(prefix) && (!best || prefix.length > best.length)) {
        best = { provider, length: prefix.length };
      }
    }
  }
  return best?.provider ?? null;
}

/** May this provider be read at all, given the owner's choice about unverified sources. */
export function ingestionAllowed(
  provider: Provider,
  options: { unverifiedSources: boolean },
  use: typeof APP_USE = APP_USE,
): boolean {
  const status = authorizationFor(provider, use);
  if (status === "not_configured") return false;
  if (status === "unverified") return options.unverifiedSources;
  return true;
}

/** "zgoda (użytek prywatny)", for the sources screen. */
export const AUTHORIZATION_LABELS: Record<AuthorizationStatus, string> = {
  granted: "zgoda",
  open_license: "otwarta licencja",
  user_provided: "Twoje dane",
  unverified: "brak potwierdzonej zgody",
  not_configured: "wymaga umowy lub klucza",
};
