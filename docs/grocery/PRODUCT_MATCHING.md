# Product matching

Is this product the item on my list? `src/lib/grocery/matching.ts` answers with a tier, built on the
existing keyword rules in `src/lib/prices/match.ts`. No AI.

## Tiers

| Tier | When | Counts in |
|---|---|---|
| `gtin` | The same barcode as the item (an item pinned to a GTIN, e.g. from a receipt). In-store codes (EAN-13 starting 2/02/04, EAN-8 starting 0/2) never match across chains | verified verdict and reference |
| `listing` | I confirmed this retailer product with "Tak" | verified verdict and reference |
| `attributes` | The keyword rule accepts the product, every attribute the item names is stated and equal, every other word of the item is in the product's name, and the pack is read, not assumed | verified verdict and reference |
| `category` | The rule accepts it and nothing conflicts, but something the item names is not stated (fat level, a kind, a word, the pack) | reference only, labelled "ten rodzaj produktu, nie podano: …" |
| `substitution` | The rule accepts it but an attribute or kind differs | never priced; shown under "Niepoliczone" for approval ("Tak" makes it a listing) |
| `none` | Another product, an excluded brand, an answered "Nie", a pack in another unit, a drink for a solid food | nowhere |

## What it understands

- **Polish text**: letters folded (`ł`→`l`, diacritics dropped), words split; English names from open data
  get Polish words added ("Virgin Olive Oil" → "oliwa z oliwek").
- **Inflection**: word stems (`kurczaka` → `kurcz`, `jajka`/`jaja` → `jaj`, `plastrach` → `plastr`).
- **Variants** (`variantOf`): fat (chudy/półtłusty/tłusty/light/lekki, or a percent, compared by family:
  twaróg ≤1 % chudy, ≤5 % półtłusty; mleko ≤0,5/≤2; jogurt ≤1/≤3; ser ≤12/≤20; mięso ≤5/≤15), rice type,
  egg size, processing state (cooked, smoked, frozen, canned, dried), wholegrain, lactose-free, bio, extra virgin.
- **Kinds** (`compareKinds`): mutually exclusive kinds within a family — berries, pasta shapes, cheese types,
  colours of peppers/onions/beans, tomato varieties, honeys, egg farming (0–3), bread grain, Greek vs natural
  yogurt. Another kind is a substitution; no kind stated is unknown; several is a mix (unknown).
- **Packs**: grams, kilograms, millilitres, litres, pieces, "4 x 125 g", "10 jaj"; grams↔millilitres only as
  an approximation; pieces never convert to weight; a solid item is never priced by a pack in millilitres.
- **Cooked/smoked meat** is never the raw meat on the list (except items that are themselves cooked).
- **Brands**: excluded brands (settings) are never suggested.

## False positives fixed (tests in `matching.test.ts`)

Found with `promoCandidates` before the work, and by the Warsaw pilot's manual audit of real feed and
community data:

- twaróg tłusty → twaróg chudy; jogurt grecki 10 % → jogurt 2 %; mozzarella → mozzarella light; wołowina 20 % → wołowina 5 %
- Skyr szarlotka → skyr; Ogórki małosolne → ogórek
- Skorzonera → orzo; Pestki dyni → pesto; Odżywka do włosów → whey; Ciasteczka kakaowe → kakao;
  Beef Jerky Teriyaki → sos teriyaki; Produkt sojowy → sos sojowy; Filetki z Indykiem → filet z indyka;
  Łój wołowy → wołowina; Ser krem → ser gouda; Tortilla z mięsem → tortilla; Pomidory całe (tin) → pomidor;
  baton z masłem orzechowym → masło orzechowe; Dip serowy (salsa) → salsa; Spaghetti 4 sery → makaron
- Hummus paprykowy → papryka; koktajl białkowy truskawka-banan → banan; Kubuś woda o smaku malina → maliny;
  Curry Flavour → curry; napój jabłko 300 ml → jabłko
- Second pilot audit (Open Food Facts and Open Prices names, see WARSAW_PILOT.md): Kebab z kurczaka, … czerwona
  papryka → papryka; Owsiane smoothie mango i banan → banan; Tuńczyk Mexicans z warzywami → tuńczyk; Lays Papryka →
  papryka; Chrupki pomidor z serem → pomidor; "Mozarella, pomidor, cebula czerwona" → cebula; Premium Whey Bar →
  whey; Pieczywo Sonko Lekkie (crispbread) → pieczywo; Cebula dymka (spring onions) → cebula; Ogórek Dziadunia (a
  jar) → ogórek; Smoked sweet paprika (the spice) → papryka; Refried Black Beans → fasola; Müllermilch Banana Taste
  → banan; Napar owocowy z maliną (tea) → maliny; Szynka Filet z Indyk → filet z indyka; Fitos Śmietana & cebula
  (crisps) → cebula; Hummus … spicy salsa → salsa; Bio Kokos Truskawka Banan → banan; Japońska wołowina smak wasabi
  → wołowina; krakersy czerwona papryka → papryka; Piratki Filet z Kurczaka (a cold cut) → filet z kurczaka
- Frisco's feed names leave out the brand: "Spaghetti Napoli" is Winiary's "Pomysł na…" seasoning mix and
  "pomidor oliwki" is Bake Rolls. Products whose URL names a seasoning-mix or snack line are dropped from the feed
  (`NOT_AN_INGREDIENT` in `frisco.ts`)
- Kinds: penne for spaghetti, yellow for red pepper, raspberries for strawberries, forest for multiflower
  honey, organic for free-range eggs, Greek for natural yogurt and the other way round

## Limits

- Name rules cannot see what a name does not say: a brand-only name ("Ogórek Dziadunia", a jar; "Pieczywo Sonko",
  crispbread) passes until someone adds the brand to the rule. Open-data names are the noisiest (English, brand
  first, dishes listing their ingredients); retailer feeds name the product plainly. Community data is
  reference-only anyway, and Open Food Facts gives identity, never a price.
- English names get Polish words (`withPolish`), including the ones that change meaning: "paprika" is the spice
  ("papryka mielona"), "smoked" → "wędzone", "refried" → "pasta", "taste/flavour" → "smak", colours.
- A name listing several foods with commas ("mozzarella, pomidor, cebula") is a dish for the fresh produce rules.
- A rule-accepted product for a generic item ("ryż", "jajka") is an exact match by design: the item asks for
  any rice, any eggs. Being cheaper but a different brand is expected.
