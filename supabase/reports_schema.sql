-- Reports table
create table if not exists reports (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  file_url     text not null,
  file_path    text not null,
  bu_id        uuid references business_units(id) on delete set null,
  uploaded_by  uuid references profiles(id) on delete set null,
  file_size    integer,
  created_at   timestamptz not null default now()
);
alter table reports enable row level security;
drop policy if exists "Authenticated users full access on reports" on reports;
create policy "Authenticated users full access on reports" on reports
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
