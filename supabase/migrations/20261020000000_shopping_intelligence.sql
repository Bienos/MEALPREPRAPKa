-- Shopping intelligence: where I shop from, what online delivery costs, and a
-- history of every price seen, so a deal can be judged against earlier weeks.

-- The town the comparison is for (online shops deliver to some towns only).
-- A town, never a street: that is all the comparison needs.
alter table settings add column shopping_city text not null default 'Warszawa';

-- What a delivery costs at an online shop, as I know it: an estimate from the
-- shop's own delivery page, or the fee I saw at checkout (confirmed). Never
-- invented: a provider with no row has an unknown fee and says so.
create table delivery_quotes (
  provider    text primary key,
  fee         numeric(10,2) check (fee >= 0),
  free_above  numeric(10,2) check (free_above > 0),
  min_order   numeric(10,2) check (min_order > 0),
  confirmed   boolean not null default false,
  note        text not null default '',
  updated_at  timestamptz not null default now()
);
alter table delivery_quotes enable row level security;

-- Every price observed, appended by trigger when a promo or shelf price is
-- stored with a new price: the record behind "najniższa od września".
create table price_observations (
  id            bigserial primary key,
  shop          text not null,
  product_key   text not null,
  name          text not null,
  kind          text not null check (kind in ('promo', 'shelf')),
  price         numeric(10,2) not null,
  pack_quantity numeric(10,2),
  pack_unit     text,
  loose         boolean not null default false,
  observed_at   timestamptz not null default now()
);
create index price_observations_product on price_observations (shop, product_key, observed_at desc);
alter table price_observations enable row level security;

create or replace function record_promo_observation() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.promo_price is distinct from old.promo_price then
    insert into price_observations (shop, product_key, name, kind, price, pack_quantity, pack_unit, loose, observed_at)
    values (new.shop, new.product_key, new.name, 'promo', new.promo_price, new.pack_quantity, new.pack_unit, new.loose, new.fetched_at);
  end if;
  return new;
end $$;

create or replace function record_shelf_observation() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.price is distinct from old.price then
    insert into price_observations (shop, product_key, name, kind, price, pack_quantity, pack_unit, loose, observed_at)
    values (new.shop, new.product_key, new.name, 'shelf', new.price, new.pack_quantity, new.pack_unit, new.loose, new.fetched_at);
  end if;
  return new;
end $$;

create trigger shop_promos_observe after insert or update on shop_promos
  for each row execute function record_promo_observation();
create trigger shelf_prices_observe after insert or update on shelf_prices
  for each row execute function record_shelf_observation();
