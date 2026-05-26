-- CRM: contacts
create table if not exists crm_contacts (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  company     text,
  email       text,
  phone       text,
  notes       text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table crm_contacts enable row level security;
drop policy if exists "Authenticated users full access on crm_contacts" on crm_contacts;
create policy "Authenticated users full access on crm_contacts" on crm_contacts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- CRM: deals
create table if not exists crm_deals (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  deal_type    text not null default 'OTHER',       -- SPONSORSHIP | PARTNERSHIP | ADVERTISING | EVENT | OTHER
  stage        text not null default 'LEAD',        -- LEAD | CONTACTED | PROPOSAL | NEGOTIATING | WON | LOST
  value        numeric(12,2),
  probability  integer default 50 check (probability between 0 and 100),
  close_date   date,
  bu_id        uuid references business_units(id) on delete set null,
  contact_id   uuid references crm_contacts(id) on delete set null,
  description  text,
  lost_reason  text,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table crm_deals enable row level security;
drop policy if exists "Authenticated users full access on crm_deals" on crm_deals;
create policy "Authenticated users full access on crm_deals" on crm_deals
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- CRM: deal ↔ task links
create table if not exists crm_deal_tasks (
  deal_id  uuid not null references crm_deals(id) on delete cascade,
  task_id  uuid not null references tasks(id) on delete cascade,
  primary key (deal_id, task_id)
);
alter table crm_deal_tasks enable row level security;
drop policy if exists "Authenticated users full access on crm_deal_tasks" on crm_deal_tasks;
create policy "Authenticated users full access on crm_deal_tasks" on crm_deal_tasks
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- CRM: deal activity log
create table if not exists crm_activities (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references crm_deals(id) on delete cascade,
  type        text not null default 'NOTE',         -- CALL | EMAIL | MEETING | NOTE
  body        text not null,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table crm_activities enable row level security;
drop policy if exists "Authenticated users full access on crm_activities" on crm_activities;
create policy "Authenticated users full access on crm_activities" on crm_activities
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
