-- Where is my shopping cheapest: this week's shop promotions, my own prices,
-- and which promo products I said are (or are not) a shopping-list item.
-- Shops are code constants (src/lib/prices/types.ts); a new shop is a new migration.

-- This week's promotions as read from the shop's website. A refresh replaces
-- that shop's rows, so nothing here is edited by hand.
create table shop_promos (
  id            uuid primary key default gen_random_uuid(),
  shop          text not null check (shop in ('lidl', 'biedronka')),
  -- The shop's own product id ("lidl:11405938"). The same product comes back
  -- under the same id, so a confirmed match carries over to next week.
  product_key   text not null,
  name          text not null,
  pack_quantity numeric(10,2) check (pack_quantity > 0),
  pack_unit     text check (pack_unit in ('g', 'ml', 'szt')),
  -- Sold by weight ("luzem"): the price is per pack_quantity and you pay for what you take.
  loose         boolean not null default false,
  promo_price   numeric(10,2) not null check (promo_price >= 0),
  -- The struck-through price ("cena przed obniżką", the Omnibus 30-day price), when shown.
  regular_price numeric(10,2) check (regular_price >= 0),
  valid_from    date not null,
  valid_to      date,
  conditions    text not null default '',
  app_only      boolean not null default false,
  -- "1+1 gratis", "-50% przy zakupie 2". multibuy_min is how many packs it takes.
  multibuy      text,
  multibuy_min  integer not null default 1 check (multibuy_min >= 1),
  source_url    text not null,
  fetched_at    timestamptz not null default now(),
  unique (shop, product_key),
  check ((pack_quantity is null) = (pack_unit is null)),
  check (valid_to is null or valid_to >= valid_from)
);

-- My price for a shopping item at a shop. Typed once, it sticks until I change it.
-- item_name is the shopping_items name, trimmed and lower-cased.
create table shop_prices (
  id            uuid primary key default gen_random_uuid(),
  item_name     text not null,
  shop          text not null check (shop in ('lidl', 'biedronka')),
  product_label text not null default '',
  pack_quantity numeric(10,2) not null check (pack_quantity > 0),
  pack_unit     text not null check (pack_unit in ('g', 'ml', 'szt')),
  price         numeric(10,2) not null check (price > 0),
  updated_at    timestamptz not null default now(),
  unique (item_name, shop)
);

-- "Pasuje?" answers: this promo product is (or is not) my shopping item.
-- A yes makes the product match automatically every week it is on promo;
-- a no stops it being suggested for that item again.
create table shop_product_links (
  id           uuid primary key default gen_random_uuid(),
  item_name    text not null,
  shop         text not null check (shop in ('lidl', 'biedronka')),
  product_key  text not null,
  -- What was answered, so the table reads sensibly by hand.
  product_name text not null,
  matches      boolean not null,
  updated_at   timestamptz not null default now(),
  unique (item_name, shop, product_key)
);

create trigger shop_prices_updated_at before update on shop_prices
  for each row execute function set_updated_at();
create trigger shop_product_links_updated_at before update on shop_product_links
  for each row execute function set_updated_at();

alter table shop_promos       enable row level security;
alter table shop_prices        enable row level security;
alter table shop_product_links enable row level security;
