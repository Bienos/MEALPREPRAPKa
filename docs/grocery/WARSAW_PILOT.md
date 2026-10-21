# Warsaw pilot

A reproducible measurement of how much of the MealPrep shopping list the app can price, and how well, from
the sources it is allowed to use. Run on 2026-10-21 against live data. Nothing in this report is estimated:
a source that gave nothing is counted as zero, and a source that was not read says why.

```
node scripts/warsaw-pilot.mts            # full run, 20–35 min (Open Food Facts: 10 searches a minute, retries on 503)
node scripts/warsaw-pilot.mts --skip-off # without Open Food Facts, under a minute
node scripts/warsaw-pilot.mts --reuse-off docs/grocery/pilot/off-searches-2026-10-21.json
```

The published files come from the last command (21.10.2026, 00:21 UTC): every source read live except Open
Food Facts, whose answers were reused from the full run that ended five minutes earlier
([`pilot/off-searches-2026-10-21.json`](pilot/off-searches-2026-10-21.json)). In between only the catalogue
side changed (sauces, Frisco's weighed-but-counted packs, "bbq" = "barbecue"); the Open Food Facts matching had not.

Raw results: [`pilot/warsaw-pilot-2026-10-21.json`](pilot/warsaw-pilot-2026-10-21.json) (summary plus every product
and its best match per source) and [`pilot/warsaw-pilot-2026-10-21.csv`](pilot/warsaw-pilot-2026-10-21.csv) (the
research package's column layout, one row per product and source; `reviewer` / `review_date` left empty
for a manual review).

## Method

- **Library**: the meal sheet read live through its public CSV export (60 distinct
  ingredients after `aggregateIngredients`). Every ingredient is in the product table; none was left out.
- **100 products**: each sheet ingredient and the retail products a shopper would buy for it, in the pilot's
  categories (meat and fish, dairy, eggs, rice and pasta, bread, vegetables, fruit, frozen, pantry, sauces,
  supplements). Some ingredients get several products: the generic one ("jogurt naturalny"), the exact one
  ("jogurt 2%"), a pack ("skyr naturalny 450 g") and a variant ("jaja L"), so exact-pack and variant matching are
  tested, not only "is there yogurt". The table is in `scripts/warsaw-pilot.mts`.
- **Matching**: the app's own `matchCandidate` (tiers gtin → listing → attributes → category → substitution),
  so the pilot measures what the shopping card would show. "Exact" means tiers gtin, listing or attributes.
- **Eligibility**: the app's own `assessPrice` with Warszawa, store and online, no loyalty apps.
- **Basket**: the real library's ingredient list (57 items with a quantity) through `assessAll`
  and `verifiedVerdict`, the code behind "Gdzie najtaniej?".

## Sources

| Source | Read | Why |
|---|---|---|
| Open Food Facts search (Poland filter) | yes, 1 search per product | ODbL, documented API, 10 searches/min respected |
| Open Prices (every PLN price, Poland gate in code) | yes, 22 pages | ODbL, documented API |
| Frisco product feed | yes | robots.txt grants personal non-commercial use |
| Lidl "Rewolucja cenowa" everyday prices | from the repository | typed by hand from the retailer's own leaflet (user-provided transcription) |
| lidl.pl, Blix, Biedronka online, Auchan online, Stokrotka feed | **no** | no permission on record; off by policy (`GROCERY_UNVERIFIED_SOURCES` off) |
| GS1 Polska eProdukty | **no** | blocked: no subscription or credentials |
| Kaufland, Carrefour, Dino, Aldi, Netto catalogues | **no** | no authorized source exists |

## Results (2026-10-21)

### Product identity: Open Food Facts

| | Products |
|---|---|
| Searches answered | 64 of 100 (36 failed with HTTP 503 even after one retry 20 s later; 63 needed a retry) |
| Any result in Poland | 63 |
| Exact product (attributes tier) | 45 |
| Only "this kind of product" (category) | 11 |
| Exact pack, of the 11 products that name one | 4 |

Open Food Facts gives a barcode, a name and nutrition, never a price. Its search is not dependable as a live
source: on 21.10.2026 it answered 503 to 39–63 of 100 first attempts across three full runs, well inside its
published limit, and a retry 20 s later did not always help.
The app uses it only for one barcode at a time on the sources screen.

### Price history: Open Prices (community)

1,841 Polish PLN records were readable (of 2,176 PLN records in total; rejected: 50 duplicate, 257 no product, 25 not poland, 3 online).

| | Products |
|---|---|
| Any observation in Poland | 75 |
| In Warszawa | 43 |
| In Warszawa, last 90 days | 42 |
| Same barcode as the Open Food Facts product (gtin tier) | 8 |

Warszawa, last 90 days, by chain (products with at least one observation):

| Biedronka | Lidl | Kaufland | Auchan | Carrefour | Stokrotka | Żabka | Other |
|---|---|---|---|---|---|---|---|
| 3 | 8 | 0 | 0 | 36 | 5 | 1 | 3 |

These are dated observations from one shop each, with a receipt or price-tag photo. They are history, never a
current price: on the shopping card they show as "ze społeczności" with their date, and they cannot enter the
verified verdict. Carrefour leads only because a few contributors photograph its receipts.

### Current prices

| Source | State on the card | Products exactly matched |
|---|---|---|
| Frisco (online, Warszawa delivery), 12,730 products in stock | zweryfikowana, aktualna | 91 (any match: 96; exact pack: 8 of 11) |
| Lidl everyday prices (published, valid to 31.12.2026) | oferta opublikowana | 8 |
| Biedronka, Kaufland, Auchan, Carrefour (stores) | — | 0: no authorized source |

By category (exact matches, products in the category):

| Category | Frisco verified | Open Prices Warszawa 90 days | Open Food Facts exact |
|---|---|---|---|
| Meat and fish | 12/14 | 1/14 | 4/14 |
| Dairy | 18/21 | 14/21 | 15/21 |
| Eggs | 6/6 | 6/6 | 2/6 |
| Rice and pasta | 8/9 | 3/9 | 8/9 |
| Bread | 5/5 | 3/5 | 4/5 |
| Pantry | 17/19 | 5/19 | 10/19 |
| Vegetables | 9/9 | 3/9 | 2/9 |
| Canned | 7/8 | 2/8 | 0/8 |
| Fruit | 3/3 | 0/3 | 0/3 |
| Frozen | 3/3 | 2/3 | 0/3 |
| Oils | 3/3 | 3/3 | 0/3 |

### The basket

The meal library's real shopping list, 57 items with a quantity, through the app's own pricing:

- **Verdict: "Nie da się ustalić najtańszego pełnego koszyka z dostępnych danych."**
- Strict coverage (verified current or published, exact match): Frisco 48 of 57; Lidl 5 of 57.
- Frisco lacks: indyk 5%, wołowina 5%, białka jaj, feta light, ser light, ryż microwave gotowy, salsa, sos sweet chilli, whey.
- Reference view (everything usable, each line labelled): Frisco 53 (53 verified); Carrefour 12 (12 community); Lidl 7 (6 published, 1 community); Stokrotka 3 (3 community); Biedronka 1 (1 community); Żabka 1 (1 community).

No shop prices the whole list from authorized data, so the app does not name a cheapest basket. That is the
correct answer for today's data, not a fault: the closest complete source is Frisco (online, personal use
only), and the in-store chains have no authorized current prices at all.

## Manual audit of the matches

Every match in the published file was read by hand against the product name, the pack and, where the name was
unclear, the product page. "Wrong" means a shopper would not buy it for the item; "weak" means a related product
that the card shows only as "ten rodzaj produktu" (category), never in the verified verdict.

| Source | Exact matches | Wrong | Category matches | Wrong or weak |
|---|---|---|---|---|
| Frisco | 91 | 0 | 5 | 3 weak (łata wołowa for wołowina 5 %, ser kozi for ser light, soy isolate for whey) |
| Open Food Facts | 45 | 2 (protein snack "Piramidki … ser cebula" for cebula; "Max karbowane papryka" crisps for papryka) | 11 | 1 wrong (pesto with red pepper), 2 weak (Greek yogurt for jogurt 2 %, stewing beef for wołowina 5 %) |
| Open Prices | 23 | 0 | 19 | 3 weak (Greek for 2 %, high-protein cheese for ser light, passata for pomidory krojone) |
| Lidl everyday | 8 | 0 | 4 | 2 weak (ser carski for ser light, gluten-free pasta for wholegrain) |

- Exact-match precision in the published run: Frisco 91/91, Lidl 8/8, Open Prices 23/23, Open Food Facts 43/45.
  The three Open Food Facts errors were fixed in the rules after the run (tests in `matching.test.ts`); the
  figures above still include them, because the reused search answers were judged before the fix.
- The audits got here in rounds. The first full run had 14 wrong matches (kebab for papryka, smoothie for banan,
  Lays for papryka, spring onions for cebula, "paprika" the spice, refried beans, a banana milk drink, raspberry
  tea, …). The third run had 9 (2 at Frisco: a Winiary "Pomysł na… Spaghetti Napoli" seasoning mix and Bake
  Rolls "pomidor oliwki", whose brand only the URL names; 7 in Open Food Facts). It also showed that no sauce
  item could ever be priced (sauces were in the "not the plain ingredient" lists) and that Frisco's tortillas,
  sold by weight but named "(4 szt.)", could never price grams. All are fixed with regression tests and listed
  in [PRODUCT_MATCHING.md](PRODUCT_MATCHING.md).
- Open-data names are the noisy ones: brand first, English, or a dish or snack naming the ingredient. Frisco's
  plain product names gave no wrong exact match once the brand-only lines were dropped.
- Pack: an exact match with another pack size (800 g wanted, 500 g sold) is correct: the basket buys whole packs
  to cover the amount.

## Blocked or not measured

- **lidl.pl, Blix (leaflets of every chain), Biedronka and Auchan online shops, Stokrotka's feed**: not read.
  There is no permission on record for automated reuse, so they are off by policy. With
  `GROCERY_UNVERIFIED_SOURCES=on` they run for private use and their prices show as "niezweryfikowane".
- **GS1 Polska eProdukty**: blocked, no subscription or API key.
- **Kaufland, Carrefour, Dino, Aldi, Netto, Żabka**: no public catalogue or authorized feed exists.
- **Price accuracy against the shelf**: not measured. That needs someone to compare prices in a shop on the same
  day; the CSV has `reviewer` and `review_date` columns for it.
- **Store-level prices**: Frisco is one online shop; Lidl's everyday prices are national. No source gives a
  price for a particular Warsaw store today except Open Prices history.

## What would change the verdict

1. A licensed feed from one chain (the template is `src/lib/grocery/providers/licensed-feed.ts`): Biedronka or
   Lidl with GTINs and store prices would be the first complete in-store basket.
2. Written permission from a source that is off today (a reply from Blix or a chain), recorded in the registry.
3. My own receipts: each saved receipt adds dated prices for the shop I actually use.
4. For Frisco's missing items: where the card offers "ten rodzaj produktu" (lean meats with no fat percentage in
   the name, cheeses without "light"), confirming the right product once with "Tak" makes it exact. Four
   products have nothing in its feed today: białka jaj, ryż microwave, salsa (only dips) and sos sweet chilli
   (searched in the feed by hand on 21.10.2026).

