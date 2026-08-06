-- Proyectos v1 — YA APLICADO en producción vía conector (migración
-- projects_planner_v1). Se guarda aquí como fuente de verdad del esquema.
-- El planeador gestiona EVENTOS y PROYECTOS multidisciplinarios
-- (adecuación de espacio, remodelación, apertura…), chicos o grandes.
alter table event_plans add column if not exists kind text not null default 'evento';
do $$ begin
  alter table event_plans add constraint event_plans_kind_check
    check (kind in ('evento','adecuacion','remodelacion','apertura','mantenimiento','otro'));
exception when duplicate_object then null; end $$;
alter table event_plans add column if not exists end_date date;

-- Recursos requeridos (1 bartender, 2 meseros, 1 guardia, equipo…)
create table if not exists public.project_resources (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references event_plans(id) on delete cascade,
  name       text not null,
  qty        int not null default 1 check (qty > 0),
  unit_cost  numeric,
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists idx_presources_event on project_resources (event_id);

-- Presupuesto por partidas: gastos (sombreros, vasos…) e ingresos
-- (patrocinios — ligables a un deal del CRM)
create table if not exists public.project_budget_items (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references event_plans(id) on delete cascade,
  concept    text not null,
  amount     numeric not null default 0,
  is_income  boolean not null default false,
  deal_id    uuid references crm_deals(id) on delete set null,
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists idx_pbudget_event on project_budget_items (event_id);

alter table project_resources enable row level security;
alter table project_budget_items enable row level security;
drop policy if exists presources_select on project_resources;
create policy presources_select on project_resources for select to authenticated using (true);
drop policy if exists presources_write on project_resources;
create policy presources_write on project_resources for all to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM'))
  with check (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM'));
drop policy if exists pbudget_select on project_budget_items;
create policy pbudget_select on project_budget_items for select to authenticated using (true);
drop policy if exists pbudget_write on project_budget_items;
create policy pbudget_write on project_budget_items for all to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM'))
  with check (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM'));
