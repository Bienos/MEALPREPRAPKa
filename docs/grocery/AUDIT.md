# Grocery intelligence: implementation audit (20.10.2026)

Read before the grocery work started. Facts below were checked in this repository and with plain
requests from the build environment on 20.10.2026; anything not checked says so.

## What exists and must keep working

| Area | Where | Notes |
|---|---|---|
| Shopping list from planned meals | `meals/prep.ts` `rebuildShoppingList()`, `meals/ingredients.ts` | Two weeks of planned meals minus fridge portions; "warzywa" and "owoce" expanded; ticks survive rebuilds. 60 distinct ingredients in the 19.10 sheet snapshot. |
| Price sources | `prices/lidl.ts`, `blix.ts`, `biedronka.ts`, `auchan.ts`, `frisco.ts`, `stokrotka.ts`, `lidl-everyday.ts` | Pure parsers with recorded fixtures and tests. |
| Matching | `prices/match.ts` | Deterministic Polish keyword rules with exclusions, "Tak/Nie" answers stored per item and product, usual-pack table for leaflet prices without a pack. |
| Basket | `prices/basket.ts` | Whole packs rounded up, loose goods exact, multi-buys in whole multiples, missing prices counted, comparison on the items every contender prices. |
| Delivery | `prices/delivery.ts` | Fees never guessed; published fee with source and day, or typed (confirmed). |
| Price history | `price_observations` + triggers | Every new promo/shelf price appended. |
| Screens | `/prep/zakupy` (card "Gdzie najtaniej?"), `/prep/promocje`, `/prep/porownaj` | Every price shows source and day (`prices/source.ts`). |
| Refresh | buttons, screen self-refresh, daily cron `/api/refresh-prices` (CRON_SECRET) | Each source replaces only its own rows; one failing never erases another. |
| Auth | `src/proxy.ts` | Every page and server action behind the session cookie; RLS on, no policies, service key server-only. |

Baseline before changes: 304 tests pass, `tsc` and ESLint clean.

## Reusable as is

`parsePack`, the source parsers, `match.ts` rules (category and exclusion knowledge), `basket.ts`
pack arithmetic, `delivery.ts`, `source.ts` labels, the `rows()/ok()` Zod data-access pattern,
`source_refreshes` for refresh bookkeeping, the fixture-based test style.

## Source audit

| Source | What it really reads | robots.txt (20.10.2026) | Permission on record | Scope | Freshness assumption in code |
|---|---|---|---|---|---|
| Lidl (`lidl.ts`) | lidl.pl's internal search JSON (`/q/api/search?...category=Żywność i napoje`) | not disallowed (rules block `search?q=`, `sort=`, `id=`) | none | national promo prices, Lidl Plus app prices | valid dates from the item |
| Blix (`blix.ts`) | blix.pl product pages as JSON (`?async=1`), plus a full sweep of ~150 pages | allowed (only `/api/*`, shopping lists blocked) | none (Grupa Blix offers partnerships) | leaflets of 11 chains, national | offer "available" assumed valid 6 days |
| Biedronka (`biedronka.ts`) | sitemap, product pages, category pages of zakupy.biedronka.pl | allowed (search and filters blocked) | none | online shop prices, delivery towns only | product 14 days, category 3 days, used 30 days; out-of-stock price derived from unit price |
| Auchan (`auchan.ts`) | category pages, `window.__INITIAL_STATE__` | allowed (`/api/`, `/search`, `/offers` blocked); 202 rate limiting respected | none (Auchan DataSharing exists) | online shop | 3 days per category, used 30 days |
| Stokrotka (`stokrotka.ts`) | Google Merchant feed `/xml/google_products.xml` | explicitly allowed | none (allowing a crawler is not a licence) | online shop | 12 h |
| Frisco (`frisco.ts`) | public product feed | robots.txt text: *"If you want to crawl our product database for personal, non-commercial use, please be polite … access following link … full product feed"* | **personal, non-commercial use granted in writing** | online grocer, delivery towns | 12 h |
| Lidl everyday (`lidl-everyday.ts`) | 52 prices typed by hand from a public Lidl leaflet | n/a | user transcription of a retailer publication, personal use | national, valid to 31.12.2026 | until leaflet end |

All six web adapters are technically polite (low volume, on tap or daily, limits respected), but a
working parser is not a licence. Only Frisco has written permission, and only for personal,
non-commercial use, which is what this single-user app is.

## Open data, re-verified

- **Open Prices**: documented API (`/api/schema`), daily JSONL dumps, ODbL. The prices endpoint has
  **no country filter**: an unknown parameter (`location_osm_address_country_code`) is silently
  ignored and returns other countries, so the Poland gate must be enforced in code (currency PLN and
  location country `PL`). Measured: 2,176 PLN prices, Poland 157 locations / 2,157 prices; 538
  prices within 25 km of central Warsaw, 469 dated 2026 (Carrefour Market 229, Lidl 86, Stokrotka
  27, Biedronka 12, Żabka 8, Carrefour 10, Auchan 1, Kaufland 1). 411 receipt proofs, 127 price tags.
  The previous note "Polska praktycznie nieobecna" in `SHOPPING_INTELLIGENCE.md` is out of date.
- **Open Food Facts**: documented API, ODbL; reads 15 req/min/IP, search 10 req/min/IP; custom
  User-Agent required; bulk data preferred above a few hundred products. Country tags are not
  proof of Polish availability (a Mlekpol product, barcode 590…, is tagged only "United Kingdom").
- **GS1 Polska eProdukty**: paid tiers per the research package (May 2025). The pricing page could
  not be re-read from this environment (TLS chain error, then 503); no public API documentation
  found. No credentials exist, so this stays a disabled placeholder.

## Architectural gaps

1. No provider registry: authorization, licence and capabilities are prose in a markdown table.
2. No canonical product (GTIN) layer; matching is name rules only, so variants slip through.
   Checked with `promoCandidates`: "Twaróg tłusty" is accepted for "twaróg chudy", "Jogurt grecki
   10%" for "jogurt 2%", plain "Mozzarella" for "mozzarella light", "Wołowina mielona 20%" for
   "wołowina 5%". (Sushi rice and quail eggs are already rejected.)
3. Prices are floats in złoty; the ledger (`price_observations`) has no evidence, provider,
   location, validity or verification status.
4. No eligibility states: a leaflet estimate, a 25-day-old online shelf price and a confirmed price
   all add into one total.
5. `bestOptions` can name a shop with missing prices as the best "W sklepie" answer; nothing says
   "no complete basket can be determined".
6. App-only (loyalty) promos are always applied; Lidl's adapter prefers the Lidl Plus price.
7. No receipts, no store locations, no data-quality checks, no sync diagnostics.

## Data-quality risks

Derived prices (Biedronka out-of-stock pack price from the per-kilo price; Auchan pack from price ÷
unit price), assumed packs for leaflet offers, Blix validity assumed 6 days, 30-day reuse of online
shelf prices, Open Prices records with null currency/date in other countries, OFF country tags.

## Licensing risks

Five web adapters without permission (high, research register); ODbL obligations for Open Prices
and OFF (attribution; share-alike if a derived database is published; keep open and proprietary
data separable); receipts carry personal data (high).

## Database changes needed (additive only)

Provider state, retailers, stores, canonical products, retailer listings, evidence, an
evidence-linked price ledger in integer grosz, sync runs, receipts and receipt lines, contribution
queue, shopping preferences in `settings`. Existing tables stay untouched.

## Implementation order

1. Provider registry + ingestion gate (unverified web adapters off unless explicitly enabled).
2. Migration and data access for the canonical layer.
3. Open Prices (Poland gate) and Open Food Facts adapters with recorded fixtures.
4. Matching tiers with Polish normalization and variant conflicts.
5. Price eligibility engine (states, grosz, loyalty, freshness, region).
6. Basket: completeness, strict verdict, separate estimated totals.
7. UI: verdict, tier labels, sources screen, preferences.
8. Receipts (manual and pasted text first, private, opt-in contributions).
9. Warsaw pilot with measured numbers.
10. Docs and regression checks.
