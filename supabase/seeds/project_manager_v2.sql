-- ═════════════════════════════════════════════════════════════════════════════
-- PROJECT MANAGER v2 — ventana modular, actividad con detalle, gastos ligados
-- y documentos del proyecto.
--
--   1. event_plans.modules  — qué secciones activó el usuario en ESTE proyecto
--      (la plantilla por tipo da el default; el usuario agrega o quita).
--   2. event_plans.extra    — campos que dependen del tipo (canales y KPI de
--      una campaña, cliente y precio de venta si es externo, área solicitante
--      si es interno) sin abrir una columna por cada uno.
--   3. project_budget_items.activity_id / task_id — una partida puede colgar
--      de una actividad ("mesas del taller") o de una tarea concreta. Así la
--      actividad y la tarea muestran cuánto cuestan.
--   4. project_files — adjuntos del proyecto y de sus actividades (planos,
--      renders, contratos, fotos). Las tareas ya tenían los suyos (task_proofs).
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente. Requiere project_manager_v1.sql.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1 y 2. Ventana modular ──────────────────────────────────────────────────
alter table event_plans add column if not exists modules jsonb;
alter table event_plans add column if not exists extra   jsonb not null default '{}'::jsonb;

-- ─── 3. Gastos ligados a actividad o tarea ───────────────────────────────────
do $$ begin
  if to_regclass('public.project_budget_items') is null then
    raise notice 'project_budget_items no existe: corre projects_planner_v1.sql y project_budget_v2.sql primero';
    return;
  end if;
  alter table project_budget_items add column if not exists task_id uuid references tasks(id) on delete set null;
  if to_regclass('public.project_activities') is not null then
    alter table project_budget_items add column if not exists activity_id uuid references project_activities(id) on delete set null;
    create index if not exists idx_pbudget_activity on project_budget_items (activity_id) where activity_id is not null;
  end if;
  create index if not exists idx_pbudget_task on project_budget_items (task_id) where task_id is not null;
end $$;

-- ─── 4. Documentos del proyecto / de la actividad ────────────────────────────
create table if not exists public.project_files (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references event_plans(id) on delete cascade,
  activity_id  uuid,                      -- FK abajo, si el programa existe
  name         text not null,
  url          text not null,
  file_type    text,
  size_bytes   bigint,
  note         text,
  uploaded_by  uuid references profiles(id) on delete set null,
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists idx_pfiles_event on project_files (event_id, archived);
create index if not exists idx_pfiles_activity on project_files (activity_id) where activity_id is not null;

do $$ begin
  if to_regclass('public.project_activities') is not null
     and not exists (select 1 from pg_constraint where conname = 'project_files_activity_id_fkey') then
    alter table project_files add constraint project_files_activity_id_fkey
      foreign key (activity_id) references project_activities(id) on delete set null;
  end if;
end $$;

alter table project_files enable row level security;
drop policy if exists pfiles_select on project_files;
create policy pfiles_select on project_files for select to authenticated using (true);
drop policy if exists pfiles_write on project_files;
create policy pfiles_write on project_files for all to authenticated
  using (coalesce(hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM'), false))
  with check (coalesce(hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM'), false));

notify pgrst, 'reload schema';
