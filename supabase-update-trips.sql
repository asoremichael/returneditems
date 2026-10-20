-- RUN THIS ONCE if you already set up the database earlier (you already have the "reports" table).
-- Supabase: SQL Editor -> New query -> paste -> Run.
-- It adds a "trip" marker, so items submitted together can be signed together.
-- It is safe to run more than once, and it keeps all your existing reports.

alter table reports add column if not exists batch_id text;
create index if not exists reports_batch_id_idx on reports (batch_id);
