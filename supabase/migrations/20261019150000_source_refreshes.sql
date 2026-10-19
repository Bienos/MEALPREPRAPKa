-- When a price source last finished a full read, so a slow full read (the Blix
-- sweep of every grocery offer, ~1 minute) is not repeated on every tap.
create table source_refreshes (
  source      text primary key,
  finished_at timestamptz not null default now()
);

alter table source_refreshes enable row level security;
