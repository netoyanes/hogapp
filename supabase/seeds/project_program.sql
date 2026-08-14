-- ─────────────────────────────────────────────────────────────────────────────
-- PROGRAMA DEL PROYECTO — la agenda de un evento que dura varios días.
--
-- Un proyecto ya tiene TAREAS (trabajo con fecha límite y responsable: "definir
-- costos antes del 14 de agosto"). Lo que faltaba es el PROGRAMA: lo que
-- SUCEDE durante el evento, con día y horario ("Yoga, miércoles 16, 10:30–12:00").
-- Son cosas distintas y por eso viven aparte:
--   · una tarea se COMPLETA — tiene assigned_to y un flujo de aprobación
--   · una actividad OCURRE — tiene hora de inicio y fin, lugar, quién la
--     imparte y a veces cupo; al final se marca si se hizo o se canceló
--
-- Cada actividad puede además generar sus propias tareas de preparación
-- (tasks.activity_id), para gestionarla individual sin perder el conjunto.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.project_activities (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references event_plans(id) on delete cascade,
  date         date not null,
  start_time   text,                       -- 'HH:MM' (24h)
  end_time     text,                       -- 'HH:MM'; puede cruzar medianoche
  title        text not null,
  description  text,
  location     text,                       -- sala, playa, terraza, dirección…
  facilitator  text,                       -- quién la imparte (puede ser externo)
  responsible  uuid references profiles(id) on delete set null,  -- del equipo
  capacity     int,                        -- cupo, si aplica
  cost         numeric,                    -- costo de esa actividad, si aplica
  status       text not null default 'planeada'
               check (status in ('planeada','confirmada','hecha','cancelada')),
  sort         int not null default 0,     -- orden dentro del mismo día/hora
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_pactivities_event on project_activities (event_id, date, start_time);

do $$ begin
  create trigger trg_pactivities_touch before update on project_activities
    for each row execute function touch_updated_at();
exception when duplicate_object then null; end $$;

-- Una tarea puede colgar de una actividad concreta (preparar el taller de
-- ostiones) además de colgar del proyecto — así se gestiona cada actividad
-- por separado sin sacarla del conjunto.
alter table tasks add column if not exists activity_id uuid references project_activities(id) on delete set null;
create index if not exists idx_tasks_activity on tasks (activity_id) where activity_id is not null;

alter table project_activities enable row level security;
drop policy if exists pactivities_select on project_activities;
create policy pactivities_select on project_activities for select to authenticated using (true);
drop policy if exists pactivities_write on project_activities;
create policy pactivities_write on project_activities for all to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM'))
  with check (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM'));

notify pgrst, 'reload schema';
