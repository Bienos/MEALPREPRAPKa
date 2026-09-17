-- Today screen: meal status on planned meals, and default DT/DNT day templates.

alter table planned_meals
  add column status text not null default 'planned'
    check (status in ('planned', 'eaten', 'skipped', 'swapped', 'adhoc'));

-- Keep eaten_at and status consistent for rows that predate this column.
update planned_meals set status = 'eaten' where eaten_at is not null;

-- ---------------------------------------------------------------------------
-- Default day templates: an ordered set of meal-library references per day
-- type, used to fill a day plan in one tap. References the sheet by
-- meal_key/variant only — no meal data is duplicated here.
-- ---------------------------------------------------------------------------

create table default_day_meals (
  id         uuid primary key default gen_random_uuid(),
  day_type   day_type not null,
  slot       text     not null,
  position   integer  not null default 0,
  meal_key   text     not null,
  variant    day_type,
  portions   numeric(4,2) not null default 1 check (portions > 0),
  created_at timestamptz not null default now()
);

create index default_day_meals_day_type_idx on default_day_meals (day_type, position);

alter table default_day_meals enable row level security;
