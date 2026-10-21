# Grocery intelligence: architecture

MealPrep turns planned meals into a shopping list and prices it. This layer adds provenance, permission,
eligibility and honest completeness to that pricing. It runs inside the existing app: Next.js server code,
Supabase Postgres, no new services.

```
Google Sheets (meals) -> meals/ingredients.ts -> shopping_items (rebuildShoppingList)
                                                   |
Sources                                            v
  Frisco feed (permitted, personal use) ----+   prices/load.ts  (one loader for the card)
  Lidl everyday prices (typed from leaflet) +      |  promos, shelf prices, my prices,
  Open Prices (ODbL, history, Poland) ------+      |  Open Prices + receipt history for my town
  My receipts (private) --------------------+      v
  lidl.pl, Blix, Biedronka/Auchan online,       prices/match.ts      keyword rules (kind of product)
  Stokrotka feed: OFF unless                    grocery/matching.ts  tiers: gtin > listing > attributes
  GROCERY_UNVERIFIED_SOURCES=on                                      > category > substitution > none
                                                grocery/eligibility.ts  one state per price
                                                grocery/pricing.ts   strict / reference / held options
                                                prices/basket.ts     packs, grosz, completeness
                                                grocery/pricing.ts   verifiedVerdict: complete baskets only
                                                   |
                                                   v
                               Zakupy card: verified verdict, labelled reference totals, reasons
```

## Modules

| Path | Role | Runs |
|---|---|---|
| `src/lib/grocery/providers.ts` | Provider registry: access, capabilities, authorization (personal / commercial / redistribution) with evidence, licence, limits, test status | client-safe |
| `src/lib/grocery/policy.ts` | Is a source read now (registry + `GROCERY_UNVERIFIED_SOURCES`) | server |
| `src/lib/grocery/retailers.ts` | 16 Polish chains, OSM brand mapping; no price data implied | client-safe |
| `src/lib/grocery/types.ts` | `PriceFact`, conditions, loyalty programs, preferences | client-safe |
| `src/lib/grocery/money.ts`, `units.ts`, `gtin.ts` | grosz, packs and conversions, GTIN check digits | client-safe |
| `src/lib/grocery/normalize.ts`, `matching.ts` | Polish normalization, variants, kinds, match tiers | client-safe |
| `src/lib/grocery/eligibility.ts` | Price states and reasons | client-safe |
| `src/lib/grocery/pricing.ts` | Facts from stored prices, strict/reference/held options, verdict | client-safe |
| `src/lib/grocery/quality.ts` | Data-quality checks per observation and per response | client-safe |
| `src/lib/grocery/receipts.ts` | Receipt redaction, parsing, anonymized contributions | client-safe |
| `src/lib/grocery/providers/*.ts` | Open Prices, Open Food Facts, GS1 placeholder, licensed-feed template | parse: anywhere; fetch: server |
| `src/lib/grocery/sync.ts`, `runs.ts` | Open Prices sync, OFF lookups, sync-run bookkeeping | server |
| `src/lib/db/grocery.ts`, `db/receipts.ts` | Data access (Zod at the boundary) | server |
| `src/app/(app)/prep/zrodla` | Sources screen: policy, health, counts, runs, OFF lookup, Open Prices sync | page |
| `src/app/(app)/prep/paragony` | Receipts: paste/type, review, save privately, share per line, export | page |
| `scripts/warsaw-pilot.mts` | Reproducible coverage measurement | CLI |

The existing price adapters (`src/lib/prices/*.ts`) are unchanged in what they parse. They are now gated by
the policy, record sync runs, and their output is classified by the registry (`providerForKey`).

## Two stores, on purpose

The existing tables (`shop_promos`, `shelf_prices`, `shop_prices`, `shop_product_links`, `price_observations`)
stay the operational cache of the existing adapters; nothing there was migrated or rewritten. The new
evidence-linked ledger (`grocery_prices` + `grocery_evidence`) holds the new sources (Open Prices, receipts,
future licensed feeds). Both reach the card through `loadPricing()`, and both are judged by the same
eligibility engine, so a price's state never depends on which table it came from. Moving the existing
adapters into the ledger is possible later without changing the engine.

## Decisions

- **Policy in code.** Authorization is reviewed like code; the database copy (`grocery_providers`) is for
  reading and diagnostics.
- **Strict vs reference.** Only verified current prices and published offers, exactly matched, may decide
  "the cheapest complete basket". Everything else is shown, labelled, as a reference.
- **Pure core.** Matching, eligibility, the basket and receipts are pure and client-safe, so the card
  recalculates on every tap and the logic is unit-tested without a database.
- **No new infrastructure.** No queue, no search engine, no vector store: the data is small (thousands of
  rows) and Postgres plus pure TypeScript is enough. Measured: an Open Prices full sync (2,176 records) and a
  Frisco feed read (~13,000 products) each finish in seconds.
