-- ─────────────────────────────────────────────────────────────────────────────
-- REPORTES DE FALLA Y FEEDBACK — el buzón desde cualquier ventana de la app.
--
-- Cada ventana (tarea, proyecto, deal, cliente, clase…) trae una bandera
-- discreta que abre el formulario. El reporte guarda el CONTEXTO (qué ventana
-- era), la URL y la versión de la app — el "¿dónde te pasó?" viene solo.
-- Los reportes se ven en Actividad (módulo Sistema) y llegan a Slack.
-- Ejecutar en el SQL Editor. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.app_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete set null,
  kind        text not null default 'falla' check (kind in ('falla', 'mejora')),
  context     text,                -- qué ventana: "Tarea", "Proyecto: Wellness…", etc.
  message     text not null,
  url         text,
  app_version text,
  status      text not null default 'nuevo' check (status in ('nuevo', 'revisado', 'resuelto')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_app_feedback_time on app_feedback (created_at desc);

alter table app_feedback enable row level security;
drop policy if exists afb_insert on app_feedback;
create policy afb_insert on app_feedback for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists afb_select on app_feedback;
-- El Master revisa todo; cada quien puede ver lo suyo
create policy afb_select on app_feedback for select to authenticated
  using (hog_role() = 'MASTER' or user_id = auth.uid());
drop policy if exists afb_update on app_feedback;
create policy afb_update on app_feedback for update to authenticated
  using (hog_role() = 'MASTER') with check (hog_role() = 'MASTER');

notify pgrst, 'reload schema';
