-- Grocery data foundation: who provides data and on what terms, which chains
-- and shops exist, canonical products (GTIN), retailer listings, evidence, and
-- an evidence-linked price ledger in integer grosz. Plus private receipts and
-- shopping preferences.
--
-- Additive only. shop_promos, shelf_prices, shop_prices, shop_product_links and
-- price_observations stay as they are and keep working; the existing adapters
-- still write there. Policy (authorization, licence) lives in code
-- (src/lib/grocery/providers.ts) and is copied here on every sync so the table
-- reads on its own.

-- ---------------------------------------------------------------------------
-- Providers and their sync state
-- ---------------------------------------------------------------------------

create table grocery_providers (
  id                       text primary key check (id ~ '^[a-z0-9-]+$'),
  name                     text not null,
  kind                     text not null check (kind in
    ('open_data', 'retailer_feed', 'retailer_web', 'aggregator_web', 'manual', 'registry', 'licensed')),
  authorization_personal   text not null check (authorization_personal in
    ('granted', 'open_license', 'user_provided', 'unverified', 'not_configured')),
  authorization_commercial text not null check (authorization_commercial in
    ('granted', 'open_license', 'user_provided', 'unverified', 'not_configured')),
  license                  text,
  -- Whether this deployment reads it now (policy + configuration), as of the last sync.
  enabled                  boolean not null default false,
  last_success_at          timestamptz,
  last_failure_at          timestamptz,
  last_error               text,
  updated_at               timestamptz not null default now()
);

insert into grocery_providers (id, name, kind, authorization_personal, authorization_commercial, license, enabled) values
  ('open-food-facts',  'Open Food Facts',                    'open_data',      'open_license',   'open_license',   'ODbL 1.0', true),
  ('open-prices',      'Open Prices',                        'open_data',      'open_license',   'open_license',   'ODbL 1.0', true),
  ('gs1-eprodukty',    'GS1 Polska eProdukty',               'registry',       'not_configured', 'not_configured', 'Contract', false),
  ('frisco-feed',      'Frisco (product feed)',              'retailer_feed',  'granted',        'unverified',     'Personal, non-commercial use', true),
  ('stokrotka-feed',   'Stokrotka (Google Merchant feed)',   'retailer_feed',  'unverified',     'unverified',     null, false),
  ('lidl-web',         'lidl.pl (promotions)',               'retailer_web',   'unverified',     'unverified',     null, false),
  ('lidl-everyday',    'Lidl, everyday prices (by hand)',    'manual',         'user_provided',  'unverified',     null, true),
  ('blix',             'Blix (leaflets of 11 chains)',       'aggregator_web', 'unverified',     'unverified',     null, false),
  ('biedronka-online', 'Biedronka online shop',              'retailer_web',   'unverified',     'unverified',     null, false),
  ('auchan-online',    'Auchan online shop',                 'retailer_web',   'unverified',     'unverified',     null, false),
  ('user-prices',      'Twoje ceny',                         'manual',         'user_provided',  'user_provided',  null, true),
  ('receipts',         'Twoje paragony',                     'manual',         'user_provided',  'user_provided',  null, true),
  ('licensed-feed',    'Licensed partner feed (template)',   'licensed',       'not_configured', 'not_configured', 'Per contract', false);

create trigger grocery_providers_updated_at before update on grocery_providers
  for each row execute function set_updated_at();

-- One row per sync attempt: what came in, what was kept, what was rejected and why.
create table grocery_sync_runs (
  id          bigserial primary key,
  provider_id text not null references grocery_providers(id),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null check (status in ('running', 'ok', 'partial', 'failed', 'skipped')),
  fetched     integer not null default 0 check (fetched >= 0),
  imported    integer not null default 0 check (imported >= 0),
  rejected    integer not null default 0 check (rejected >= 0),
  duplicates  integer not null default 0 check (duplicates >= 0),
  -- Rejections and warnings by reason: {"not_poland": 12, "currency": 3}.
  issues      jsonb not null default '{}'::jsonb,
  error       text,
  check (finished_at is null or finished_at >= started_at)
);
create index grocery_sync_runs_provider on grocery_sync_runs (provider_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Retailers and their shops
-- ---------------------------------------------------------------------------

-- A chain we know about. Its presence here says nothing about having its prices.
create table grocery_retailers (
  id         text primary key check (id ~ '^[a-z]+$'),
  name       text not null,
  website    text not null,
  has_stores boolean not null,
  -- Its online grocery shop, when this project has read it; null when not checked.
  online_url text,
  wholesale  boolean not null default false
);

insert into grocery_retailers (id, name, website, has_stores, online_url, wholesale) values
  ('biedronka',   'Biedronka',   'https://www.biedronka.pl/', true,  'https://zakupy.biedronka.pl/', false),
  ('lidl',        'Lidl',        'https://www.lidl.pl/',      true,  null,                           false),
  ('kaufland',    'Kaufland',    'https://www.kaufland.pl/',  true,  null,                           false),
  ('auchan',      'Auchan',      'https://www.auchan.pl/',    true,  'https://zakupy.auchan.pl/',    false),
  ('carrefour',   'Carrefour',   'https://www.carrefour.pl/', true,  null,                           false),
  ('dino',        'Dino',        'https://marketdino.pl/',    true,  null,                           false),
  ('aldi',        'Aldi',        'https://www.aldi.pl/',      true,  null,                           false),
  ('netto',       'Netto',       'https://netto.pl/',         true,  null,                           false),
  ('zabka',       'Żabka',       'https://www.zabka.pl/',     true,  null,                           false),
  ('frisco',      'Frisco',      'https://www.frisco.pl/',    false, 'https://www.frisco.pl/',       false),
  ('stokrotka',   'Stokrotka',   'https://stokrotka.pl/',     true,  'https://sklep.stokrotka.pl/',  false),
  ('intermarche', 'Intermarché', 'https://intermarche.pl/',   true,  null,                           false),
  ('leclerc',     'E.Leclerc',   'https://leclerc.pl/',       true,  null,                           false),
  ('spar',        'SPAR',        'https://spar.pl/',          true,  null,                           false),
  ('selgros',     'Selgros',     'https://selgros.pl/',       true,  null,                           true),
  ('makro',       'Makro',       'https://www.makro.pl/',     true,  null,                           true);

-- A physical shop (from OpenStreetMap via Open Prices) or an online shop's
-- delivery area. Poland only: the coordinates must fall inside the country's box.
create table grocery_stores (
  id                 uuid primary key default gen_random_uuid(),
  -- Null: a shop of a chain we do not track (a drugstore, a mall).
  retailer_id        text references grocery_retailers(id),
  provider_id        text not null references grocery_providers(id),
  -- The provider's own id ("osm:NODE:123", Open Prices location 1045).
  provider_record_id text not null,
  name               text not null,
  city               text,
  postcode           text,
  country_code       char(2) not null check (country_code = 'PL'),
  lat                double precision check (lat between 48.9 and 55.0),
  lon                double precision check (lon between 14.0 and 24.3),
  channel            text not null check (channel in ('store', 'online')),
  -- For an online shop: the town it delivers to.
  delivery_region    text,
  updated_at         timestamptz not null default now(),
  unique (provider_id, provider_record_id)
);
create index grocery_stores_retailer on grocery_stores (retailer_id);
create index grocery_stores_city on grocery_stores (lower(city));

create trigger grocery_stores_updated_at before update on grocery_stores
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Canonical products and retailer listings
-- ---------------------------------------------------------------------------

-- A product identity, by GTIN when there is one. Metadata comes from a source
-- (Open Food Facts), never typed in as if it were the manufacturer's.
create table grocery_products (
  id                 uuid primary key default gen_random_uuid(),
  -- GTIN-14 with leading zeros; check digit validated in code before insert.
  gtin               text unique check (gtin ~ '^[0-9]{14}$'),
  name               text not null,
  normalized_name    text not null,
  brand              text,
  category           text,
  pack_quantity      numeric(10,2) check (pack_quantity > 0),
  pack_unit          text check (pack_unit in ('g', 'ml', 'szt')),
  -- Attributes that tell variants apart: {"fat": "chudy", "percent": 2}.
  variant            jsonb not null default '{}'::jsonb,
  -- Per 100 g or 100 ml, as the source gives it: kcal, protein_g, fat_g, carbs_g.
  nutrition          jsonb,
  ingredients_text   text,
  source_provider_id text references grocery_providers(id),
  source_record_id   text,
  source_url         text,
  verification       text not null default 'source' check (verification in ('source', 'user_confirmed', 'disputed')),
  fetched_at         timestamptz not null default now(),
  check ((pack_quantity is null) = (pack_unit is null))
);
create index grocery_products_name on grocery_products (normalized_name);

-- What one retailer (or provider) sells under its own id.
create table grocery_listings (
  id                      uuid primary key default gen_random_uuid(),
  retailer_id             text not null references grocery_retailers(id),
  provider_id             text not null references grocery_providers(id),
  retailer_sku            text not null,
  product_id              uuid references grocery_products(id) on delete set null,
  name                    text not null,
  pack_quantity           numeric(10,2) check (pack_quantity > 0),
  pack_unit               text check (pack_unit in ('g', 'ml', 'szt')),
  loose                   boolean not null default false,
  url                     text,
  store_id                uuid references grocery_stores(id) on delete set null,
  -- A town for online shops, 'PL' for a national price.
  region                  text,
  channel                 text not null check (channel in ('store', 'online')),
  -- Only what the source said; 'unknown' otherwise.
  availability            text not null default 'unknown' check (availability in ('in_stock', 'out_of_stock', 'unknown')),
  availability_checked_at timestamptz,
  updated_at              timestamptz not null default now(),
  unique (provider_id, retailer_id, retailer_sku),
  check ((pack_quantity is null) = (pack_unit is null))
);
create index grocery_listings_product on grocery_listings (product_id);
create index grocery_listings_retailer on grocery_listings (retailer_id);

create trigger grocery_listings_updated_at before update on grocery_listings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Receipts (private) — before the ledger, which references their lines
-- ---------------------------------------------------------------------------

-- A purchase of mine. The photo is never stored; the text is kept only after
-- redaction (card numbers, phone numbers, e-mail, transaction ids removed).
create table receipts (
  id            uuid primary key default gen_random_uuid(),
  retailer_id   text references grocery_retailers(id),
  -- As I named the shop ("Lidl Puławska"); never shared.
  store_label   text not null default '',
  city          text,
  purchased_on  date not null,
  total_grosz   integer check (total_grosz >= 0),
  redacted_text text not null default '',
  -- sha256 of the redacted text: the same receipt saved twice is noticed.
  text_hash     text,
  created_at    timestamptz not null default now()
);
create unique index receipts_text_hash on receipts (text_hash) where text_hash is not null;

create table receipt_lines (
  id               uuid primary key default gen_random_uuid(),
  receipt_id       uuid not null references receipts(id) on delete cascade,
  position         integer not null check (position >= 0),
  raw_text         text not null default '',
  -- The product name as I corrected it.
  name             text not null,
  gtin             text check (gtin ~ '^[0-9]{14}$'),
  quantity         numeric(10,3) not null check (quantity > 0),
  unit             text not null check (unit in ('szt', 'kg')),
  unit_price_grosz integer check (unit_price_grosz > 0),
  total_grosz      integer not null check (total_grosz >= 0),
  discount_grosz   integer not null default 0 check (discount_grosz >= 0),
  -- A bottle deposit ("kaucja"), not food.
  deposit          boolean not null default false,
  -- The shopping-list item it is (price key), so it can price that item later.
  shopping_item    text,
  unique (receipt_id, position)
);

-- ---------------------------------------------------------------------------
-- Evidence and the price ledger
-- ---------------------------------------------------------------------------

create table grocery_evidence (
  id                 uuid primary key default gen_random_uuid(),
  provider_id        text not null references grocery_providers(id),
  provider_record_id text,
  evidence_type      text not null check (evidence_type in
    ('api_record', 'feed_record', 'web_page', 'leaflet', 'receipt', 'price_tag', 'manual_entry')),
  source_url         text,
  captured_at        timestamptz not null,
  -- The provider's own fields as received, the original promotion wording included.
  original           jsonb not null default '{}'::jsonb,
  -- sha256 of `original`: a changed or duplicated record is noticed.
  content_hash       text,
  license            text,
  verification       text not null check (verification in ('verified', 'unverified', 'user_confirmed')),
  -- Receipt evidence is mine: never shown outside the app, never exported.
  private            boolean not null default false,
  unique (provider_id, provider_record_id)
);

-- Every price observation with where it came from and what it is. A price is
-- a fact about one moment; whether it can be used today is decided in code
-- (src/lib/grocery/eligibility.ts), never stored as "current".
create table grocery_prices (
  id                   bigserial primary key,
  provider_id          text not null references grocery_providers(id),
  -- The provider's id for this observation: the same record is never stored twice.
  provider_record_id   text not null,
  retailer_id          text references grocery_retailers(id),
  listing_id           uuid references grocery_listings(id) on delete cascade,
  product_id           uuid references grocery_products(id) on delete set null,
  store_id             uuid references grocery_stores(id) on delete set null,
  receipt_line_id      uuid references receipt_lines(id) on delete cascade,
  -- The name the source gives it (Open Prices may have no listing).
  product_name         text not null,
  gtin                 text check (gtin ~ '^[0-9]{14}$'),
  amount_grosz         integer not null check (amount_grosz > 0),
  currency             char(3) not null default 'PLN' check (currency = 'PLN'),
  -- What the amount is for: one pack, a kilo, a litre, a piece.
  price_per            text not null default 'pack' check (price_per in ('pack', 'kg', 'l', 'piece')),
  pack_quantity        numeric(10,2) check (pack_quantity > 0),
  pack_unit            text check (pack_unit in ('g', 'ml', 'szt')),
  price_type           text not null check (price_type in ('regular', 'promotion', 'loyalty', 'multibuy', 'clearance')),
  regular_amount_grosz integer check (regular_amount_grosz > 0),
  kind                 text not null check (kind in
    ('current_offer', 'published_promotion', 'historical', 'community', 'receipt', 'manual')),
  observed_at          timestamptz not null,
  valid_from           date,
  valid_to             date,
  -- Structured conditions; the original wording stays in conditions_text and the evidence.
  loyalty_program      text,
  app_only             boolean not null default false,
  min_quantity         integer not null default 1 check (min_quantity >= 1),
  multibuy             text,
  quantity_limit       integer check (quantity_limit >= 1),
  deposit_grosz        integer not null default 0 check (deposit_grosz >= 0),
  conditions_text      text not null default '',
  evidence_id          uuid references grocery_evidence(id) on delete set null,
  verification         text not null check (verification in ('verified', 'unverified', 'user_confirmed')),
  -- A town, or 'PL' for a national price.
  region               text,
  created_at           timestamptz not null default now(),
  unique (provider_id, provider_record_id),
  check (valid_to is null or valid_from is null or valid_to >= valid_from),
  check ((pack_quantity is null) = (pack_unit is null))
);
create index grocery_prices_retailer on grocery_prices (retailer_id, observed_at desc);
create index grocery_prices_gtin on grocery_prices (gtin) where gtin is not null;
create index grocery_prices_region on grocery_prices (lower(region), observed_at desc);
create index grocery_prices_receipt_line on grocery_prices (receipt_line_id) where receipt_line_id is not null;

-- How many observations each provider has and how fresh they are, for the
-- sources screen. security_invoker: the view obeys RLS like its table.
create view grocery_price_counts with (security_invoker = true) as
  select provider_id,
         count(*)::integer as prices,
         max(observed_at)  as newest,
         min(observed_at)  as oldest
  from grocery_prices
  group by provider_id;

-- Prices I chose to share, anonymized: chain, town, day, product, price.
-- Nothing leaves the app until I export the queue myself.
create table price_contributions (
  id              uuid primary key default gen_random_uuid(),
  receipt_line_id uuid not null unique references receipt_lines(id) on delete cascade,
  retailer_id     text references grocery_retailers(id),
  city            text,
  observed_on     date not null,
  product_name    text not null,
  gtin            text check (gtin ~ '^[0-9]{14}$'),
  amount_grosz    integer not null check (amount_grosz > 0),
  price_per       text not null check (price_per in ('pack', 'kg')),
  status          text not null default 'queued' check (status in ('queued', 'exported', 'withdrawn')),
  consented_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Shopping preferences
-- ---------------------------------------------------------------------------

alter table settings
  add column shopping_channel    text   not null default 'both' check (shopping_channel in ('store', 'online', 'both')),
  -- Loyalty apps and cards I have ('lidl_plus', 'moja_biedronka', ...): app-only prices count only for these.
  add column loyalty_programs    text[] not null default '{}',
  add column preferred_retailers text[] not null default '{}',
  -- Brands never to suggest, folded to lowercase ASCII.
  add column excluded_brands     text[] not null default '{}';

alter table grocery_providers   enable row level security;
alter table grocery_sync_runs   enable row level security;
alter table grocery_retailers   enable row level security;
alter table grocery_stores      enable row level security;
alter table grocery_products    enable row level security;
alter table grocery_listings    enable row level security;
alter table receipts            enable row level security;
alter table receipt_lines       enable row level security;
alter table grocery_evidence    enable row level security;
alter table grocery_prices      enable row level security;
alter table price_contributions enable row level security;
