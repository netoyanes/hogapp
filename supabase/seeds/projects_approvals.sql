-- ═════════════════════════════════════════════════════════════════════════════
-- PROYECTOS · Flujo de aprobación (Gerente de Eficiencia)
-- El planner ENVÍA a aprobación → estado 'review' → el aprobador (función
-- 'aprobador' en Usuarios, o Master) APRUEBA o REGRESA con feedback.
-- Todo queda en project_approvals (historial auditable).
-- Idempotente. Ejecutar en el SQL Editor de Supabase.
-- ═════════════════════════════════════════════════════════════════════════════

-- 1) Nuevo estado 'review' (En aprobación) en el ciclo del plan
alter table event_plans drop constraint if exists event_plans_status_check;
alter table event_plans add constraint event_plans_status_check
  check (status in ('idea','planning','review','approved','done','cancelled'));

-- 2) Historial de decisiones: enviado / aprobado / regresado (con comentario)
create table if not exists public.project_approvals (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references event_plans(id) on delete cascade,
  action     text not null check (action in ('submitted','approved','returned')),
  comment    text,
  actor      uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_papprovals_event on project_approvals (event_id, created_at);

alter table project_approvals enable row level security;
drop policy if exists papprovals_select on project_approvals;
create policy papprovals_select on project_approvals for select to authenticated using (true);
drop policy if exists papprovals_insert on project_approvals;
create policy papprovals_insert on project_approvals for insert to authenticated
  with check (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM'));

-- 3) Función 'aprobador' en el catálogo de capabilities
do $$
declare cname text;
begin
  select conname into cname from pg_constraint
    where conrelid = 'user_capabilities'::regclass and contype = 'c' limit 1;
  if cname is not null then
    execute format('alter table user_capabilities drop constraint %I', cname);
  end if;
  alter table user_capabilities add constraint user_capabilities_capability_check
    check (capability in ('talento','aprobador'));
end $$;
