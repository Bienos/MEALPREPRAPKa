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
    access: "Udokumentowane REST API (produkt po kodzie, wyszukiwanie) i eksporty zbiorcze",
    docsUrl: "https://openfoodfacts.github.io/openfoodfacts-server/api/",
    authentication: "Bez logowania; wymagany własny User-Agent",
    capabilities: ["product_metadata"],
    identifiers: ["gtin"],
    geography: "Cały świat; tagi krajów nie dowodzą, że produkt jest w Polsce",
    channel: null,
    authorization: {
      personal: "open_license",
      commercial: "open_license",
      redistribution: "open_license",
      evidence: "Baza na ODbL, zawartość na DbCL, zdjęcia CC BY-SA (dokumentacja API).",
      checked: CHECKED,
    },
    license: "ODbL 1.0 (baza), DbCL (zawartość), CC BY-SA (zdjęcia)",
    attribution: "Dane produktu: Open Food Facts (ODbL)",
    refresh: "Na żądanie, po kodzie; pamięć 30 dni",
    rateLimit: "15 odczytów produktu i 10 wyszukiwań na minutę z jednego IP; powyżej kilkuset produktów eksport zbiorczy",
    limitations: [
      "Tylko opis produktu: bez cen i bez dowodu, że jest w polskich sklepach.",
      "Wpisywane przez społeczność: nazwy, opakowania i kategorie bywają błędne lub puste.",
    ],
    keyPrefixes: [],
    testStatus: "Parser tested on recorded v2/v3 responses (fixtures 20.10.2026).",
  },
  {
    id: "open-prices",
    name: "Open Prices",
    kind: "open_data",
    retailers: ["lidl", "biedronka", "carrefour", "stokrotka", "zabka", "auchan", "kaufland", "dino", "aldi", "netto"],
    access: "Udokumentowane REST API (/api/v1/prices) i codzienne eksporty JSONL/Parquet",
    docsUrl: "https://prices.openfoodfacts.org/api/docs",
    authentication: "Bez logowania",
    capabilities: ["historical_prices", "store_locations"],
    identifiers: ["gtin", "name"],
    geography: "Cały świat; tu tylko ceny w PLN ze sklepów w Polsce",
    channel: "store",
    authorization: {
      personal: "open_license",
      commercial: "open_license",
      redistribution: "open_license",
      evidence: "Eksporty i dane API na ODbL; trzeba podać źródło (przewodnik po danych).",
      checked: CHECKED,
    },
    license: "ODbL 1.0",
    attribution: "Ceny społeczności: Open Prices (Open Food Facts), ODbL",
    refresh: "Codziennie, przyrostowo",
    rateLimit: "Nieopisane w dokumentacji: strony po 100, jedna po drugiej, raz dziennie",
    limitations: [
      "Historyczne obserwacje z paragonów i etykiet, nie dzisiejsze ceny z półki.",
      "API cen nie ma filtra kraju i ignoruje nieznane parametry, więc Polskę sprawdza aplikacja.",
      "Mało danych: ok. 2200 polskich cen w październiku 2026, głównie kilka sklepów w Warszawie.",
    ],
    keyPrefixes: ["openprices:"],
    testStatus: "Parser and Poland gate tested on a recorded Warsaw response (20.10.2026).",
  },
  {
    id: "gs1-eprodukty",
    name: "GS1 Polska eProdukty",
    kind: "registry",
    retailers: [],
    access: "Platforma abonamentowa (www, CSV, API) do weryfikacji kodów GTIN",
    docsUrl: "https://eprodukty.gs1.pl/",
    authentication: "Konto i abonament; szczegóły API dostają abonenci",
    capabilities: ["product_metadata"],
    identifiers: ["gtin"],
    geography: "Kody GTIN z całego świata, polscy właściciele marek",
    channel: null,
    authorization: {
      personal: "not_configured",
      commercial: "not_configured",
      redistribution: "not_configured",
      evidence:
        "Brak abonamentu i klucza. Cennika nie udało się odczytać 20.10.2026 (błąd TLS, potem 503); raport badawczy podaje progi z maja 2025.",
      checked: CHECKED,
    },
    license: "Umowa (warunki abonamentu)",
    attribution: null,
    refresh: "-",
    rateLimit: "Zależnie od abonamentu",
    limitations: ["Wyłączony szkielet: nic nie jest wywoływane ani zgadywane."],
    keyPrefixes: [],
    testStatus: "Placeholder only; refuses to run without configuration (tested).",
  },
  {
    id: "frisco-feed",
    name: "Frisco (product feed)",
    kind: "retailer_feed",
    retailers: ["frisco"],
    access: "Publiczny plik produktów wskazany w frisco.pl/robots.txt",
    docsUrl: "https://www.frisco.pl/robots.txt",
    authentication: "Bez logowania",
    capabilities: ["current_prices"],
    identifiers: ["retailer_sku", "name"],
    geography: "Miasta z dostawą Frisco (m.in. Warszawa)",
    channel: "online",
    authorization: {
      personal: "granted",
      commercial: "unverified",
      redistribution: "unverified",
      evidence:
        'frisco.pl/robots.txt: "If you want to crawl our product database for personal, non-commercial use, please be polite and do not do it manually. Instead you can access following link to get precomputed, kept up-to-date full product feed."',
      checked: CHECKED,
    },
    license: "Użytek osobisty, niekomercyjny (oświadczenie w robots.txt)",
    attribution: "Ceny: frisco.pl",
    refresh: "Co 12 h",
    rateLimit: "Jedno zapytanie na odświeżenie (~57 MB)",
    limitations: [
      "Ceny w sklepie internetowym z dostawą, nie w sklepie stacjonarnym.",
      "Tylko do użytku osobistego, niekomercyjnego: publiczna wersja aplikacji musi z niego zrezygnować.",
    ],
    keyPrefixes: ["frisco:"],
    testStatus: "Parser tested on a recorded feed excerpt (19.10.2026).",
  },
  {
    id: "stokrotka-feed",
    name: "Stokrotka (Google Merchant feed)",
    kind: "retailer_feed",
    retailers: ["stokrotka"],
    access: "Plik XML Google Merchant sklepu internetowego",
    docsUrl: "https://sklep.stokrotka.pl/robots.txt",
    authentication: "Bez logowania",
    capabilities: ["current_prices"],
    identifiers: ["retailer_sku", "name"],
    geography: "Miasta z dostawą Stokrotki online",
    channel: "online",
    authorization: {
      personal: "unverified",
      commercial: "unverified",
      redistribution: "unverified",
      evidence: "robots.txt pozwala pobierać /xml/google_products.xml każdemu robotowi; to zgoda na pobieranie, nie licencja.",
      checked: CHECKED,
    },
    license: null,
    attribution: "Ceny: sklep.stokrotka.pl",
    refresh: "Co 12 h",
    rateLimit: "Jedno zapytanie na odświeżenie (~40 s)",
    limitations: ["Plik dla Google Shopping; warunki dalszego użycia nieznane.", "Tylko ceny w internecie."],
    keyPrefixes: ["stokrotka:"],
    testStatus: "Parser tested on a recorded feed excerpt (19.10.2026).",
  },
  {
    id: "lidl-web",
    name: "lidl.pl (promotions)",
    kind: "retailer_web",
    retailers: ["lidl"],
    access: "Wyszukiwarka JSON, z której korzystają strony lidl.pl (nieudokumentowana)",
    docsUrl: null,
    authentication: "Bez logowania",
    capabilities: ["promotions"],
    identifiers: ["retailer_sku", "name"],
    geography: "Polska (jeden krajowy region cen)",
    channel: "store",
    authorization: {
      personal: "unverified",
      commercial: "unverified",
      redistribution: "unverified",
      evidence: "Nieudokumentowany wewnętrzny adres; robots.txt nie blokuje używanej ścieżki. Brak zgody na piśmie.",
      checked: CHECKED,
    },
    license: null,
    attribution: "Promocje: lidl.pl",
    refresh: "Na żądanie i codziennie",
    rateLimit: "Jedno zapytanie na odświeżenie",
    limitations: ["Ok. 30 wyróżnionych ofert, nie cała gazetka.", "Ceny Lidl Plus wymagają aplikacji."],
    keyPrefixes: ["lidl:"],
    testStatus: "Parser tested on a recorded response (19.10.2026).",
  },
  {
    id: "lidl-everyday",
    name: "Lidl, everyday prices (leaflet, typed by hand)",
    kind: "manual",
    retailers: ["lidl"],
    access: "Ceny przepisane ręcznie ze stron gazetki Lidla „Rewolucja cenowa”",
    docsUrl: "https://www.lidl.pl/l/pl/gazetki/rewolucja-cenowa-oszczedzaj-kazdego-dnia-16092026/ar/0",
    authentication: "Bez logowania",
    capabilities: ["current_prices"],
    identifiers: ["name"],
    geography: "Polska (ceny Lidla są jednakowe w kraju)",
    channel: "store",
    authorization: {
      personal: "user_provided",
      commercial: "unverified",
      redistribution: "unverified",
      evidence: "Publikacja samej sieci, przepisana przez właściciela aplikacji 20.10.2026 do użytku osobistego.",
      checked: CHECKED,
    },
    license: null,
    attribution: "Stała cena Lidla (gazetka „Rewolucja cenowa”)",
    refresh: "Ręcznie, gdy zmieni się gazetka (ważna do 31.12.2026)",
    rateLimit: "-",
    limitations: ["Tylko 52 produkty.", "Przepisane ręcznie: możliwa literówka."],
    keyPrefixes: ["lidl-everyday:"],
    testStatus: "Rows tested for shape and validity dates.",
  },
  {
    id: "blix",
    name: "Blix (leaflets of 11 chains)",
    kind: "aggregator_web",
    retailers: ["lidl", "biedronka", "kaufland", "aldi", "netto", "dino", "carrefour", "auchan", "stokrotka", "zabka", "leclerc"],
    access: "Strony produktów blix.pl jako JSON (?async=1), nieudokumentowane",
    docsUrl: "https://grupablix.pl/wspolpraca/",
    authentication: "Bez logowania",
    capabilities: ["promotions"],
    identifiers: ["name"],
    geography: "Polska (gazetki krajowe)",
    channel: "store",
    authorization: {
      personal: "unverified",
      commercial: "unverified",
      redistribution: "unverified",
      evidence: "robots.txt blokuje tylko /api/* i listy zakupów; Grupa Blix oferuje współpracę w zakresie danych. Brak zgody na piśmie.",
      checked: CHECKED,
    },
    license: null,
    attribution: "Gazetki: blix.pl",
    refresh: "Na żądanie; pełny przegląd najwyżej co 12 h",
    rateLimit: "3–4 zapytania naraz, ok. 150 stron na przegląd",
    limitations: [
      "Oferty z gazetek nie podają opakowania ani dat (zakładane 6 dni).",
      "Warunki (aplikacja, karta, wielosztuki) często nie są w tekście.",
    ],
    keyPrefixes: ["blix:"],
    testStatus: "Parser tested on recorded responses (19.10.2026).",
  },
  {
    id: "biedronka-online",
    name: "Biedronka online shop",
    kind: "retailer_web",
    retailers: ["biedronka"],
    access: "Mapa strony, strony produktów i kategorii zakupy.biedronka.pl (HTML)",
    docsUrl: null,
    authentication: "Bez logowania",
    capabilities: ["current_prices"],
    identifiers: ["retailer_sku", "name"],
    geography: "Miasta z dostawą Biedronki online",
    channel: "online",
    authorization: {
      personal: "unverified",
      commercial: "unverified",
      redistribution: "unverified",
      evidence: "robots.txt blokuje wyszukiwarkę i filtry, nie strony produktów. Brak zgody na piśmie.",
      checked: CHECKED,
    },
    license: null,
    attribution: "Ceny: zakupy.biedronka.pl",
    refresh: "Strony produktów co 14 dni, kategorii co 3 dni",
    rateLimit: "3 zapytania naraz, najwyżej 45 stron produktów i 60 kategorii na raz",
    limitations: ["Ceny w internecie; sklep stacjonarny może się różnić.", "Cena opakowania przy braku na stanie jest wyliczana z ceny za kilogram."],
    keyPrefixes: ["biedronka:"],
    testStatus: "Parsers tested on recorded pages (19-20.10.2026).",
  },
  {
    id: "auchan-online",
    name: "Auchan online shop",
    kind: "retailer_web",
    retailers: ["auchan"],
    access: "Strony kategorii zakupy.auchan.pl (dane osadzone w HTML)",
    docsUrl: "https://datasharing.auchan.pl/",
    authentication: "Bez logowania",
    capabilities: ["current_prices"],
    identifiers: ["retailer_sku", "name"],
    geography: "Miasta z dostawą Auchan online",
    channel: "online",
    authorization: {
      personal: "unverified",
      commercial: "unverified",
      redistribution: "unverified",
      evidence: "robots.txt blokuje /api/, /search, /offers, nie strony kategorii; odpowiedź 202 (zwolnij) jest szanowana. Auchan prowadzi program DataSharing; brak zgody na piśmie.",
      checked: CHECKED,
    },
    license: null,
    attribution: "Ceny: zakupy.auchan.pl",
    refresh: "Co 3 dni na stronę kategorii",
    rateLimit: "2 zapytania naraz, najwyżej 40 stron na raz, stop przy pierwszym 202",
    limitations: ["Ceny w internecie.", "Opakowanie czasem wyliczane jako cena ÷ cena jednostkowa."],
    keyPrefixes: ["auchan:"],
    testStatus: "Parser tested on a recorded page (20.10.2026).",
  },
  {
    id: "user-prices",
    name: "Twoje ceny",
    kind: "manual",
    retailers: [],
    access: "Wpisane ręcznie na ekranie zakupów",
    docsUrl: null,
    authentication: "-",
    capabilities: ["historical_prices"],
    identifiers: ["name"],
    geography: "Tam, gdzie robisz zakupy",
    channel: "store",
    authorization: {
      personal: "user_provided",
      commercial: "user_provided",
      redistribution: "user_provided",
      evidence: "Twoja własna obserwacja.",
      checked: CHECKED,
    },
    license: null,
    attribution: "Twoja cena",
    refresh: "Przy wpisaniu",
    rateLimit: "-",
    limitations: ["Cena widziana raz; może być nieaktualna."],
    keyPrefixes: [],
    testStatus: "Covered by basket tests.",
  },
  {
    id: "receipts",
    name: "Twoje paragony",
    kind: "manual",
    retailers: [],
    access: "Tekst paragonu wklejony lub wpisany, sprawdzony linia po linii",
    docsUrl: null,
    authentication: "-",
    capabilities: ["historical_prices", "receipts"],
    identifiers: ["gtin", "name"],
    geography: "Sklep z paragonu",
    channel: "store",
    authorization: {
      personal: "user_provided",
      commercial: "user_provided",
      redistribution: "user_provided",
      evidence: "Twoje zakupy; udostępniane tylko pojedyncze linie, za wyraźną zgodą.",
      checked: CHECKED,
    },
    license: null,
    attribution: "Z Twojego paragonu",
    refresh: "Przy zapisie",
    rateLimit: "-",
    limitations: ["Historyczne: ile kosztowało tamtego dnia, nie dziś."],
    keyPrefixes: ["receipt:"],
    testStatus: "Receipt parser, redaction and contribution tests.",
  },
  {
    id: "licensed-feed",
    name: "Licensed partner feed (template)",
    kind: "licensed",
    retailers: [],
    access: "CSV lub JSON od partnera danych na podstawie umowy (schemat w licensed-feed.ts)",
    docsUrl: null,
    authentication: "Według umowy",
    capabilities: ["current_prices", "promotions"],
    identifiers: ["gtin", "retailer_sku"],
    geography: "Według umowy",
    channel: "both",
    authorization: {
      personal: "not_configured",
      commercial: "not_configured",
      redistribution: "not_configured",
      evidence: "Brak umowy z partnerem. Każdy partner dostanie tu własny wpis z odwołaniem do licencji.",
      checked: CHECKED,
    },
    license: "Według umowy",
    attribution: null,
    refresh: "Według umowy",
    rateLimit: "Według umowy",
    limitations: ["Szablon: nic nie importuje, dopóki nie ma partnera i licencji."],
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
