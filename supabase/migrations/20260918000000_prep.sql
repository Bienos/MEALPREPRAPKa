-- Prep workflow: a session you build, cook through, and turn into fridge portions.
-- prep_batches and portions already exist and are reused as-is.

create table prep_sessions (
  id           uuid primary key default gen_random_uuid(),
  status       text not null default 'draft' check (status in ('draft', 'cooking', 'done', 'abandoned')),
  -- [{ "date": "2026-09-21", "day_type": "DT" }, ...] — the days this prep covers.
  days         jsonb not null default '[]'::jsonb,
  current_step integer not null default 0 check (current_step >= 0),
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  completed_at timestamptz
);

-- One row per dish AND variant, e.g. Chicken Rice DT x4 and Chicken Rice DNT x2.
-- Macros are a snapshot so a later sheet edit cannot rewrite what was cooked.
create table prep_session_items (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references prep_sessions (id) on delete cascade,
  position      integer not null default 0,
  meal_key      text not null,
  meal_name     text not null,
  variant       day_type,
  portions      integer not null check (portions > 0),
  kcal          integer not null check (kcal >= 0),
  protein_g     numeric(6,1) not null check (protein_g >= 0),
  fat_g         numeric(6,1) not null check (fat_g >= 0),
  carbs_g       numeric(6,1) not null check (carbs_g >= 0),
  ingredients   text not null default '',
  fridge_days   integer not null default 0 check (fridge_days >= 0),
  prep_minutes  integer not null default 0 check (prep_minutes >= 0),
  created_at    timestamptz not null default now()
);

create index prep_session_items_session_idx on prep_session_items (session_id, position);

-- Staples normally already at home. Excluded from the shopping list while in stock.
create table pantry_staples (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  in_stock   boolean not null default true,
  created_at timestamptz not null default now()
);

insert into pantry_staples (name) values
  ('whey'), ('oliwa'), ('ryż'), ('masło orzechowe'), ('sos sojowy'), ('przyprawy')
on conflict (name) do nothing;

-- Shopping list gains grouping and an "I already have this" flag.
alter table shopping_items
  add column category text not null default 'other'
    check (category in ('meat', 'dairy', 'carbs', 'vegetables', 'fruit', 'other')),
  add column owned boolean not null default false;

alter table prep_sessions      enable row level security;
alter table prep_session_items enable row level security;
alter table pantry_staples     enable row level security;
