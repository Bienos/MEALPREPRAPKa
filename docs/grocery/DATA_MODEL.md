# Data model

Migration: `supabase/migrations/20261020120000_grocery_foundation.sql`. Additive: no existing table changes
except four new columns on `settings`. RLS is enabled on every table with no policies (only the server's
service key reads them); the counts view uses `security_invoker` so it obeys RLS too. Verified by applying
all migrations to a fresh Postgres 16 and by an anonymous PostgREST request returning nothing.

## Tables

| Table | Purpose | Key constraints |
|---|---|---|
| `grocery_providers` | Provider ids (FK target), copy of the registry policy, sync state | id slug; authorization enums |
| `grocery_sync_runs` | One row per read: fetched, imported, rejected, duplicates, `issues` (counts by reason), error | finished ≥ started |
| `grocery_retailers` | The 16 chains | seeded |
| `grocery_stores` | Shops (from Open Prices / OpenStreetMap) or online delivery areas | `country_code = 'PL'`; lat 48.9–55.0, lon 14.0–24.3; unique (provider, record) |
| `grocery_products` | Canonical product: GTIN-14, name, normalized name, brand, category, pack, `variant` (attributes), nutrition per 100 g, ingredients, source | GTIN unique and 14 digits; pack amount and unit together |
| `grocery_listings` | A retailer's own product (SKU), pack, URL, store or region, channel, availability (only as the source states it) | unique (provider, retailer, SKU) |
| `grocery_evidence` | Provider record id, type (api_record, feed_record, web_page, leaflet, receipt, price_tag, manual_entry), URL, capture time, original fields, sha256 content hash, licence, verification, `private` | unique (provider, record) |
| `grocery_prices` | The price ledger: integer grosz, PLN only, `price_per` (pack/kg/l/piece), pack, `price_type` (regular, promotion, loyalty, multibuy, clearance), regular price, `kind` (current_offer, published_promotion, historical, community, receipt, manual), observed time, validity dates, loyalty program, app-only, minimum quantity, multi-buy, quantity limit, deposit, original conditions text, evidence, verification, region | amount > 0; `currency = 'PLN'`; unique (provider, record); validity ordered |
| `receipts` | A purchase: chain, my label for the shop, town, date, total, redacted text, text hash | unique text hash (no duplicate receipts) |
| `receipt_lines` | Name (corrected), GTIN, quantity, unit (szt/kg), unit price, total, discount, deposit | unique (receipt, position); cascade on receipt delete |
| `price_contributions` | Lines I agreed to share: chain, town, day, product, GTIN, price, per | one per line; status queued/exported/withdrawn; cascade |
| view `grocery_price_counts` | Prices per provider, newest and oldest observation | security_invoker |

`settings` gains `shopping_channel` (store/online/both), `loyalty_programs`, `preferred_retailers`,
`excluded_brands`. The app tolerates unknown values in them (dropped, never thrown).

## What is never stored as a fact

- "Current". Whether a price can be used today is computed (`eligibility.ts`) from the observation time,
  validity and provider, every time. An old row cannot be "current" by accident.
- Personal receipt data: the photo is never received; the text is redacted before storage (twice: in the
  browser and on the server); evidence of receipts is marked `private`.
- Contributor identities from Open Prices (`owner`) are never read.

## Existing tables, unchanged

`shop_promos`, `shelf_prices`, `shop_prices`, `shop_product_links`, `price_observations`, `delivery_quotes`,
`source_refreshes`. They keep serving the existing adapters. `shop_prices` rows now expose `updated_at` to
the app so a typed price carries its date.

## Money

All new code computes in integer grosz (`money.ts`); `basket.ts` sums in grosz and gives złoty only for
display. Weighed goods round half up like a till (0,834 kg × 23,99 zł/kg = 20,01 zł).
