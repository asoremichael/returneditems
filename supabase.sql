-- FIRST-TIME SETUP ONLY: run this once in Supabase: SQL Editor -> New query -> paste -> Run
-- (If you already ran an older version of this file, run supabase-update-trips.sql instead.)

create table reports (
  id               bigint generated always as identity primary key,
  item             text    not null,
  quantity         integer not null check (quantity > 0),
  site             text    not null,
  reason           text    not null,
  return_date      date    not null,
  serial_number    text,
  engineer_name    text,
  images           text[]  not null default '{}',   -- file names in the storage bucket
  supervisor_name  text,
  supervisor_date  date,
  manager_name     text,
  manager_date     date,
  created_at       timestamptz not null default now(),
  batch_id         text                              -- items submitted together share one value (a "trip")
);

create index reports_batch_id_idx on reports (batch_id);

-- Lock the table: nobody can read it directly from a browser.
-- Only our server functions (using the service key) can access it.
alter table reports enable row level security;

-- Private bucket for photos (not public)
insert into storage.buckets (id, name, public)
values ('report-images', 'report-images', false)
on conflict (id) do nothing;
