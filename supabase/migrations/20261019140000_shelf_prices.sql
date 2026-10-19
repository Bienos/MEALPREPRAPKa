-- Regular shelf prices read from a shop's own online catalogue (Biedronka's
-- zakupy.biedronka.pl), next to the leaflet deals in shop_promos. Fetched only
-- on "Sprawdź promocje" for products that look like my list, kept for weeks,
-- refreshed when older than two weeks. Nothing here is edited by hand.
create table shelf_prices (
  id            uuid primary key default gen_random_uuid(),
  shop          text not null check (
    shop in ('lidl', 'biedronka', 'kaufland', 'aldi', 'netto', 'dino', 'carrefour', 'auchan', 'stokrotka', 'zabka', 'leclerc')
  ),
  -- The shop's product id ("biedronka:0000003518").
  product_key   text not null,
  name          text not null,
  -- What the price is for: a pack, or (loose) a kilo or litre sold by weight.
  pack_quantity numeric(10,2) not null check (pack_quantity > 0),
  pack_unit     text not null check (pack_unit in ('g', 'ml', 'szt')),
  loose         boolean not null default false,
  price         numeric(10,2) not null check (price > 0),
  source_url    text not null,
  fetched_at    timestamptz not null default now(),
  unique (shop, product_key)
);

alter table shelf_prices enable row level security;
