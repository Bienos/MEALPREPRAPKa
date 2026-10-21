# Price verification

`src/lib/grocery/eligibility.ts` gives every price one state and the reasons, deterministically. The same
price under the same context always gets the same state.

## Checks, in order (first failure wins)

1. **Data**: currency PLN; amount a positive whole number of grosz; pack, if any, positive; provider known.
2. **Authorization**: a provider that needs a contract (`not_configured`) never counts.
3. **Place**: the shopping channel (store / online / both) and town. An online price needs delivery to the
   town; a single shop's price (Open Prices, a receipt) must be from the town.
4. **Availability and dates**: out of stock → unavailable; past `valid_to` → expired; before `valid_from` →
   unavailable ("obowiązuje od …").
5. **Conditions**: a loyalty or app-only price counts only if that app is enabled in "Jak robię zakupy"
   (Lidl Plus, Moja Biedronka, Żappka, …); an app-only price of a chain with no known app never counts.
   Short-date clearance ("EXPIRES_SOON") is a one-off and never a shelf price.
6. **Age**: a current offer older than 3 days becomes historical; anything older than 90 days expires.
7. **Trust**: an unverified provider → `unverified`; a derived price (assumed pack, price from a unit price)
   → `estimated`; a current offer or published offer without evidence → `estimated`; a granted provider with
   evidence → `verified_current`; a published offer (validity dates, evidence) from a granted or user-provided
   source → `published_promotion`; community → `community`; receipts and typed prices → `historical`.

## States

| State | Label on screen | Verified verdict | Reference totals |
|---|---|---|---|
| `verified_current` | zweryfikowana, aktualna | yes | yes |
| `published_promotion` | oferta opublikowana | yes | yes |
| `historical` | historyczna | no | yes, only where nothing current exists |
| `community` | ze społeczności | no | yes, only where nothing current exists |
| `estimated` | szacunek | no | yes |
| `unverified` | źródło niezweryfikowane | no | yes |
| `expired`, `unavailable`, `invalid` | nieaktualna, niedostępna, błędna | no | no (listed under "Niepoliczone" with the reason) |

## Arithmetic

- Integer grosz everywhere; złoty only at display.
- Packs: whole packs rounded up so the amount is always covered; loose goods cost exactly what is taken.
- Multi-buy: the promo price applies to whole multiples of the required count; the rest at the regular price;
  no regular price known → the line has no price (never guessed).
- Price per kilo / litre / piece is computed from the pack (`unitPrice`).
- A price derived from a unit price, or an assumed pack, is marked and can never be verified.
- Deposits are separate lines on receipts and never food prices.

## Evidence

Every price on screen shows its source label, the day it was read, and a link: the product page, the
leaflet page, the Open Prices price page (with its photo proof), or the receipts screen for my own receipts.

## Not verifiable today

Loyalty pricing at chains whose apps are not modelled; quantity limits ("max 6 szt.") are carried in the
ledger but no source in use provides them; store-specific prices for the big chains (no authorized source).
