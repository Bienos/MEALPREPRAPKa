# Basket optimization

The card "Gdzie najtaniej?" on Zakupy and on the week plan prices the items still to buy.

## Two answers, never mixed

1. **Verified verdict** ("Pełny koszyk, ceny zweryfikowane"). Built only from strict options: verified
   current prices and published offers, exactly matched (tiers gtin/listing/attributes). A shop is ranked only
   if it prices **every** item. If no shop does, the card says
   **"Nie da się ustalić najtańszego pełnego koszyka z dostępnych danych."** and lists how close the closest
   shops are, naming what they lack ("Frisco 13 z 14 (brak: jogurt 2%)").
2. **Reference** ("Orientacyjnie, ze wszystkich danych"). Everything usable, each line labelled with its state
   and match tier; totals say how many lines are verified, unverified, historical or estimated, and how many
   have no price. A shop with missing prices is called "Najpełniej … niepełny koszyk", never the cheapest.

## Modes

- **Single shop** (A): complete strict baskets ranked by total.
- **Two shops** (B): the best pair of shops one walks into that together price every item, each item where
  it is cheaper. Offered only when no single shop is complete, or when it beats the cheapest complete shop by
  at least 10 zł (`SPLIT_MIN_SAVING_GROSZ`): a second trip is not free. Online shops are not split (the
  delivery fee is per order). The reference view keeps the existing "Każde tam, gdzie taniej" comparison on
  the items the contenders all price.
- **Online delivery** (C): a complete strict online basket adds the delivery fee from the provider's own
  delivery page (with source and day) or the fee I typed from checkout (confirmed). Under the minimum order or
  with an unknown fee there is no total ("+ ?"). The Delivery tab lists every provider for the town.

A basket mixing online and in-store prices of one chain is not a way to shop and is never ranked.

## Per shop

Required items, priced items, items without a price (never zero), complete or not, counts by state, total of
priced lines (grosz), items on promotion. Promotional savings are shown per line when the source gives the
regular price; a saving is never computed from a guessed regular price.

## Hand-off

The app does not fill a retailer's basket or order: no provider has a documented API or permission for it.
It offers the two levels that are supported: links to each product page (every price's "otwórz") and the
shopping list to copy ("Skopiuj listę"). The Delivery tab says this per provider.

## Preferences ("Jak robię zakupy")

Shop and/or online, loyalty apps I have (app-only prices count only for those), my shops (shown first),
brands I never want (never suggested or counted). The town is set on the Delivery tab.
