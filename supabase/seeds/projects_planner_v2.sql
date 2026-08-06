-- Proyectos v2 — YA APLICADO en producción (migración projects_planner_v2).
-- Plantillas reutilizables + requisición operativa al gerente.
alter table event_plans add column if not exists requisition_task_id uuid references tasks(id) on delete set null;

create table if not exists public.project_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                         -- "Evento tipo POD", "Remodelación estándar"
  kind         text not null default 'evento',
  event_type   text not null default 'musica',
  resources    jsonb not null default '[]',           -- [{name, qty, unit_cost}]
  budget_items jsonb not null default '[]',           -- [{concept, amount, is_income}]
  task_bullets text,                                  -- tareas típicas, una por línea
  created_by   uuid,
  created_at   timestamptz not null default now()
);

alter table project_templates enable row level security;
drop policy if exists ptemplates_select on project_templates;
create policy ptemplates_select on project_templates for select to authenticated using (true);
drop policy if exists ptemplates_write on project_templates;
create policy ptemplates_write on project_templates for all to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM'))
  with check (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM'));
