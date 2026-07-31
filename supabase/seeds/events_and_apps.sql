-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · (1) Planeación de eventos multi-venue  (2) Apps por usuario
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1. Planeación de eventos (herramienta central, estilo Asana) ────────────
create table if not exists public.event_plans (
  id           uuid primary key default gen_random_uuid(),
  bu_id        uuid not null references business_units(id) on delete cascade,
  name         text not null,
  description  text,
  date         date,
  start_time   text,                                   -- 'HH:MM' opcional
  end_time     text,
  event_type   text not null default 'musica'
               check (event_type in ('musica','arte','performance','workshop','comunidad','comercial','deporte','privado','otro')),
  has_cover    boolean not null default false,
  cover_price  numeric,                                -- MXN, solo si has_cover
  budget       numeric,                                -- presupuesto de costos del evento
  responsible  uuid references profiles(id) on delete set null,
  status       text not null default 'idea'
               check (status in ('idea','planning','approved','done','cancelled')),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_eplans_bu_date on event_plans (bu_id, date);
create index if not exists idx_eplans_date on event_plans (date);

drop trigger if exists trg_eplans_touch on event_plans;
create trigger trg_eplans_touch before update on event_plans
  for each row execute function touch_updated_at();

alter table event_plans enable row level security;
drop policy if exists eplans_select on event_plans;
create policy eplans_select on event_plans for select to authenticated using (true);
drop policy if exists eplans_write on event_plans;
create policy eplans_write on event_plans for all to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM') and hog_has_venue(bu_id));

-- Tareas ligadas a un evento (planeación → ejecución)
alter table tasks add column if not exists event_id uuid references event_plans(id) on delete set null;
create index if not exists idx_tasks_event on tasks (event_id) where event_id is not null;

-- ─── 2. Apps por usuario ─────────────────────────────────────────────────────
-- El Master asigna qué apps ve y usa cada usuario. SIN filas = el usuario usa
-- los defaults de su rol (compatible con todo lo actual). CON filas = ve SOLO
-- esas apps (+ Perfil siempre). Master siempre ve todo.
create table if not exists public.user_apps (
  user_id    uuid not null references profiles(id) on delete cascade,
  app        text not null,
  granted_by uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, app)
);

alter table user_apps enable row level security;
drop policy if exists uapps_select on user_apps;
create policy uapps_select on user_apps for select to authenticated
  using (user_id = auth.uid() or hog_role() = 'MASTER');
drop policy if exists uapps_write on user_apps;
create policy uapps_write on user_apps for all to authenticated
  using (hog_role() = 'MASTER')
  with check (hog_role() = 'MASTER');
