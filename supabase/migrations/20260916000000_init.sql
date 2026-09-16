-- MealPrep: operational state only.
-- Meal definitions live in Google Sheets and are never stored here.
-- planned_meals and prep_batches carry macro SNAPSHOTS so history stays stable.

create type day_type as enum ('DT', 'DNT');

create function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings (single row) and DT/DNT targets
-- ---------------------------------------------------------------------------

create table settings (
  id               boolean primary key default true check (id), -- exactly one row
  default_day_type day_type not null default 'DT',
  meal_slots       text[]   not null default array['Śniadanie', 'Obiad', 'Kolacja', 'Przekąska'],
  timezone         text     not null default 'Europe/Warsaw',
  updated_at       timestamptz not null default now()
);

create trigger settings_updated_at before update on settings
  for each row execute function set_updated_at();

create table day_targets (
  day_type  day_type primary key,
  kcal      integer not null check (kcal > 0),
  protein_g integer not null check (protein_g >= 0),
  fat_g     integer not null check (fat_g >= 0),
  carbs_g   integer not null check (carbs_g >= 0),
  updated_at timestamptz not null default now()
);

create trigger day_targets_updated_at before update on day_targets
  for each row execute function set_updated_at();

insert into settings default values;

insert into day_targets (day_type, kcal, protein_g, fat_g, carbs_g) values
  ('DT',  2460, 200, 60, 280),
  ('DNT', 2360, 220, 80, 190);

-- ---------------------------------------------------------------------------
-- Prep: batches cooked and the portions they produced
-- ---------------------------------------------------------------------------

create table prep_batches (
  id            uuid primary key default gen_random_uuid(),
  meal_key      text,                         -- identifier of the meal in the sheet
  meal_name     text     not null,            -- snapshot
  variant       day_type,                     -- DT/DNT variant of the meal, if any
  cooked_on     date     not null default current_date,
  portions_made integer  not null check (portions_made > 0),
  -- macro snapshot per portion
  kcal          integer  not null check (kcal >= 0),
  protein_g     numeric(6,1) not null check (protein_g >= 0),
  fat_g         numeric(6,1) not null check (fat_g >= 0),
  carbs_g       numeric(6,1) not null check (carbs_g >= 0),
  note          text,
  created_at    timestamptz not null default now()
);

create table portions (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references prep_batches (id) on delete cascade,
  location    text not null default 'fridge' check (location in ('fridge', 'freezer')),
  status      text not null default 'available' check (status in ('available', 'eaten', 'discarded')),
  expires_on  date,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index portions_available_idx on portions (batch_id) where status = 'available';

-- ---------------------------------------------------------------------------
-- Day plans and planned/eaten meals
-- ---------------------------------------------------------------------------

create table day_plans (
  date       date primary key,
  day_type   day_type not null,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger day_plans_updated_at before update on day_plans
  for each row execute function set_updated_at();

create table planned_meals (
  id         uuid primary key default gen_random_uuid(),
  plan_date  date     not null references day_plans (date) on delete cascade,
  slot       text     not null,               -- e.g. 'Obiad'
  position   integer  not null default 0,     -- order within the day
  source     text     not null default 'sheet' check (source in ('sheet', 'manual')),
  meal_key   text,                            -- sheet identifier; null for manual entries
  meal_name  text     not null,               -- snapshot
  variant    day_type,
  portions   numeric(4,2) not null default 1 check (portions > 0),
  -- macro snapshot for the whole planned amount (already multiplied by portions)
  kcal       integer  not null check (kcal >= 0),
  protein_g  numeric(6,1) not null check (protein_g >= 0),
  fat_g      numeric(6,1) not null check (fat_g >= 0),
  carbs_g    numeric(6,1) not null check (carbs_g >= 0),
  portion_id uuid references portions (id) on delete set null, -- fridge portion consumed, if any
  eaten_at   timestamptz,                     -- null = not eaten yet; set by ZJEDZONE
  created_at timestamptz not null default now()
);

create index planned_meals_plan_date_idx on planned_meals (plan_date, position);

-- ---------------------------------------------------------------------------
-- Shopping list and weight history
-- ---------------------------------------------------------------------------

create table shopping_items (
  id         uuid primary key default gen_random_uuid(),
  name       text    not null,
  quantity   numeric(8,2),
  unit       text,
  source     text    not null default 'manual' check (source in ('prep', 'manual')),
  checked    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger shopping_items_updated_at before update on shopping_items
  for each row execute function set_updated_at();

create table weight_logs (
  date       date primary key,
  weight_kg  numeric(5,2) not null check (weight_kg > 0),
  note       text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Access: the app talks to Postgres only with the server-side secret key,
-- which bypasses RLS. Enabling RLS with no policies blocks the anon key.
-- ---------------------------------------------------------------------------

alter table settings       enable row level security;
alter table day_targets    enable row level security;
alter table prep_batches   enable row level security;
alter table portions       enable row level security;
alter table day_plans      enable row level security;
alter table planned_meals  enable row level security;
alter table shopping_items enable row level security;
alter table weight_logs    enable row level security;
