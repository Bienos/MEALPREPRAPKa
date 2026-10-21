# Data sources

Checked 20–21.10.2026 from the build environment. "Authorization" is for this deployment's use: a private,
single-user, non-commercial app (`APP_USE = "personal"` in `providers.ts`). The registry in code is the
source of truth; this page explains it.

## Open Food Facts — product metadata

| | |
|---|---|
| Source | world.openfoodfacts.org |
| Access | Documented REST API: `GET /api/v3/product/{barcode}` (v2 answers also parsed); search `GET /cgi/search.pl` with a Poland country filter (pilot only) |
| Authentication | None; a custom User-Agent is required (`MealPrep/0.1 (…)`, contact from `OPEN_FOOD_FACTS_CONTACT` or the repository URL) |
| Data | Name, brand, pack, categories, countries, nutrition per 100 g, Polish ingredients text |
| Geography | World. Country tags are volunteer data and not proof of Polish availability (a Mlekpol product is tagged only "United Kingdom") |
| Refresh | On demand per barcode; cached 30 days in `grocery_products` |
| Rate limits | 15 product reads/min/IP, 10 searches/min/IP (documented); the adapter spaces calls 4.1 s / 6.1 s |
| Licensing | ODbL (database), DbCL (contents), CC BY-SA (images). Attribution shown with the data |
| Limitations | No prices. Community-entered names and packs (often brand-first, English, or a dish or snack naming the ingredient: the pilot audits found 5–6 wrong exact name matches per run, all since fixed). The search endpoint answered 503 to 39–63 of 100 first attempts in three runs on 21.10.2026; the pilot retries once after 20 s, and 25–36 still failed |
| Tests | Parser on recorded v2/v3 responses, not-found answers, search answer (`providers.test.ts`); live lookup verified against a local database |

## Open Prices — community price history

| | |
|---|---|
| Source | prices.openfoodfacts.org |
| Access | Documented REST API `GET /api/v1/prices` (schema at `/api/schema`); daily JSONL/Parquet dumps exist but are not used |
| Authentication | None for reading |
| Data | Price, currency, date, discount type, shop (OpenStreetMap), product (with Open Food Facts metadata), proof type (receipt / price tag) |
| Geography | World. **No country filter on the prices endpoint**; an unknown parameter is silently ignored. The app asks for `currency=PLN` and keeps only records whose shop's country code is `PL` |
| Refresh | Daily (cron), incremental by creation date with two days of overlap; manual sync on the sources screen (at most every 5 minutes) |
| Rate limits | Not documented; read sequentially, 100 per page, once a day |
| Licensing | ODbL; the source is credited on every price ("Open Prices (paragon lub etykieta)") |
| Limitations | Historical observations, not current prices. Sparse: 2,176 PLN records on 20.10.2026; 25 of them were from shops outside Poland and are rejected |
| Tests | Poland gate, duplicates, discounts, privacy (no usernames) on a trimmed recorded response; live sync verified: 2,176 read, 1,807 kept, 369 rejected with reasons, second run stored no duplicates |

## GS1 Polska eProdukty — GTIN registry (disabled)

| | |
|---|---|
| Access | Subscription platform; API documentation is given to subscribers |
| Authentication | Account + key (`GS1_EPRODUKTY_API_KEY`), not available |
| Status | Disabled placeholder: `lookupGs1` refuses and calls nothing. The pricing page could not be re-read on 20.10.2026 (TLS error, then HTTP 503); the research package cites the May 2025 tiers |
| Tests | Refusal and "what is missing" list |

## Frisco — product feed (permitted for personal use)

| | |
|---|---|
| Source | `commerce.frisco.pl/api/v1/integration/feeds/public`, linked from frisco.pl/robots.txt |
| Authorization | robots.txt: *"If you want to crawl our product database for personal, non-commercial use, please be polite and do not do it manually. Instead you can access following link to get precomputed, kept up-to-date full product feed."* → **granted for personal use**, not for commercial use or redistribution |
| Data | ~13,000 in-stock products: name, regular price, pack, availability, URL |
| Geography | Online, Frisco delivery towns (Warszawa included) |
| Refresh | Every 12 h (one ~57 MB request) |
| Limitations | Online prices with delivery. A public deployment must stop using it (`APP_USE = "commercial"` turns it off) |
| Tests | Parser on a recorded excerpt; live read verified (12,940 in-stock products) |

## Lidl everyday prices — typed from a Lidl leaflet

| | |
|---|---|
| Source | Lidl's leaflet "Rewolucja cenowa" (valid to 31.12.2026), 52 prices typed by hand on 20.10.2026 |
| Authorization | User transcription of a retailer publication for personal use |
| State | "Published offer" with validity dates; national prices |
| Limitations | 52 products; typos possible; must be re-typed when the leaflet changes |

## Sources without permission on record (off unless `GROCERY_UNVERIFIED_SOURCES=on`)

| Provider | What it reads | robots.txt | Notes |
|---|---|---|---|
| lidl.pl (`lidl-web`) | Internal search JSON its pages use | path not disallowed | ~30 featured deals; Lidl Plus prices need the app |
| Blix (`blix`) | blix.pl product pages as JSON | allowed (only `/api/*` and shopping lists blocked) | 11 chains' leaflets; no pack, validity assumed 6 days; Grupa Blix offers data partnerships |
| Biedronka online (`biedronka-online`) | sitemap, product and category pages | allowed (search and filters blocked) | online prices; out-of-stock pack price derived from per-kilo price |
| Auchan online (`auchan-online`) | category pages (embedded state) | allowed (`/api/`, `/search` blocked); 202 = slow down, respected | Auchan runs DataSharing |
| Stokrotka feed (`stokrotka-feed`) | Google Merchant feed | explicitly allowed | a crawl allowance is not a licence |

All five keep their parsers and fixture tests. When turned on they run as before, record sync runs, and their
prices are labelled "źródło niezweryfikowane": usable in the reference totals, never in the verified verdict.

## User data

| Provider | Data | Notes |
|---|---|---|
| `user-prices` | Prices typed on the shopping card (`shop_prices`) | History from the day typed |
| `receipts` | Receipt lines (`receipts`, `receipt_lines`, ledger rows with private evidence) | Private; shared only per line, anonymized, by CSV export |

## Not available

Kaufland, Carrefour, Dino, Aldi, Netto, Żabka, Intermarché, E.Leclerc, SPAR, Selgros, Makro: no authorized
source of current prices exists in this deployment. Their leaflets are in Blix (off by default) and some
appear in Open Prices as history. Delivery apps (Glovo, Wolt, Lisek) are links only.
