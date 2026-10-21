# Provider registry

`src/lib/grocery/providers.ts` declares every source. Each entry has:

| Field | Meaning |
|---|---|
| `id`, `name`, `kind` | `open_data`, `retailer_feed`, `retailer_web`, `aggregator_web`, `manual`, `registry`, `licensed` |
| `retailers` | Chains whose data it carries |
| `access`, `docsUrl`, `authentication` | How it is read |
| `capabilities` | `product_metadata`, `current_prices`, `promotions`, `historical_prices`, `store_locations`, `receipts` |
| `identifiers` | `gtin`, `retailer_sku`, `name` |
| `geography`, `channel` | Where its prices apply; store or online |
| `authorization.personal / commercial / redistribution` | `granted`, `open_license`, `user_provided`, `unverified`, `not_configured` |
| `authorization.evidence`, `.checked` | What the status rests on (quoted where possible) and when it was checked |
| `license`, `attribution` | Licence and the credit shown with the data |
| `refresh`, `rateLimit`, `limitations`, `testStatus` | Operations |
| `keyPrefixes` | Product-key prefixes its rows carry, so any stored price finds its provider (`providerForKey`) |

## Current statuses (personal use)

| Provider | Personal | Commercial | Read now |
|---|---|---|---|
| open-food-facts | open_license | open_license | yes |
| open-prices | open_license | open_license | yes |
| gs1-eprodukty | not_configured | not_configured | never |
| frisco-feed | **granted** | unverified | yes |
| stokrotka-feed | unverified | unverified | only with `GROCERY_UNVERIFIED_SOURCES=on` |
| lidl-web | unverified | unverified | only with the switch |
| lidl-everyday | user_provided | unverified | yes (static list) |
| blix | unverified | unverified | only with the switch |
| biedronka-online | unverified | unverified | only with the switch |
| auchan-online | unverified | unverified | only with the switch |
| user-prices | user_provided | user_provided | yes |
| receipts | user_provided | user_provided | yes |
| licensed-feed | not_configured | not_configured | never (template) |

## Rules derived from it

- `ingestionAllowed`: `not_configured` never runs; `unverified` runs only with the switch; others run.
- `grantsVerifiedPrices`: only `granted` providers with current-price or promotion capability can produce a
  "verified current" price.
- `APP_USE`: set to `"commercial"` and every personal-only permission (Frisco) stops counting.
- The table `grocery_providers` mirrors the registry and adds state (`enabled`, last success, last failure,
  last error); it is rewritten from code on every Open Prices sync.

## Onboarding a new provider

1. Get written permission or a licence. Record it: `authorization` = `granted` for the uses it covers, the
   contract reference in `evidence`, the date in `checked`.
2. Add the entry with a unique `keyPrefixes` value and an id in `PROVIDER_IDS`; add a migration inserting its
   row into `grocery_providers`.
3. Deliver the data in the format of `providers/licensed-feed.ts` (CSV or JSON, one row per offer, prices in
   grosz, PLN only, validity dates, channel, region, structured conditions) or write a parser with recorded
   fixtures.
4. Write a sync that runs `checkFact` (quality) on every row and stores rows with evidence via
   `db/grocery.ts`, wrapped in `recordRun` for diagnostics.
5. Nothing else changes: matching, eligibility, the basket and the screens read it through the registry.
