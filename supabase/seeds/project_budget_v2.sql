-- ─────────────────────────────────────────────────────────────────────────────
-- PRESUPUESTO UNIFICADO DEL PROYECTO
--
-- Antes había DOS secciones que en la práctica son lo mismo: "recursos
-- requeridos" (2 bartenders × $1,800) y "presupuesto por partidas" (renta de
-- sonido $35,000). Un bartender ES una partida de gasto — separarlas obligaba
-- a llevar la cuenta en dos lados y a sumarlas a mano para aprobar.
--
-- Ahora todo vive en project_budget_items, que gana lo que le faltaba:
--   · category  — tipo de gasto (personal, mobiliario, materiales, equipo…)
--   · area      — zona del proyecto (bar, restaurante, wellness, hotel…)
--   · qty/unit_cost — para partidas que se cuentan (2 bartenders, 8 macetas)
--   · quote_url — comprobante de cotización (imagen o PDF)
--   · responsible — quién se encarga de esa partida
-- project_resources se migra aquí y se conserva intacta por si acaso; la app
-- ya no la lee.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
alter table project_budget_items add column if not exists category    text not null default 'otro';
alter table project_budget_items add column if not exists area        text;
alter table project_budget_items add column if not exists qty         int not null default 1 check (qty > 0);
alter table project_budget_items add column if not exists unit_cost   numeric;
alter table project_budget_items add column if not exists quote_url   text;
alter table project_budget_items add column if not exists quote_type  text;
alter table project_budget_items add column if not exists responsible uuid references profiles(id) on delete set null;
alter table project_budget_items add column if not exists created_by  uuid;

do $$ begin
  alter table project_budget_items add constraint pbudget_category_check
    check (category in ('personal','mobiliario','materiales','equipo','servicios','marketing','operacion','otro'));
exception when duplicate_object then null; end $$;

-- Migración de los recursos existentes a partidas de gasto. Se marcan con
-- notes para poder distinguirlas si algo hay que revisar, y no se repite si
-- el script se corre dos veces.
insert into project_budget_items (event_id, concept, amount, is_income, category, qty, unit_cost, notes)
select r.event_id, r.name, coalesce(r.unit_cost, 0) * r.qty, false, 'personal', r.qty, r.unit_cost,
       coalesce(r.notes || ' · ', '') || 'migrado de recursos'
from project_resources r
where not exists (
  select 1 from project_budget_items b
  where b.event_id = r.event_id and b.concept = r.name and b.notes like '%migrado de recursos%'
);

-- ── Relacionados del proyecto: el equipo involucrado, además del responsable
create table if not exists public.project_collaborators (
  event_id   uuid not null references event_plans(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table project_collaborators enable row level security;
drop policy if exists pcollab_select on project_collaborators;
create policy pcollab_select on project_collaborators for select to authenticated using (true);
drop policy if exists pcollab_write on project_collaborators;
create policy pcollab_write on project_collaborators for all to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM'))
  with check (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM'));

-- ── Quién aprueba los presupuestos ──────────────────────────────────────────
-- Se reusa el mecanismo que ya existe (user_capabilities capability='aprobador'),
-- que es lo que lee canApprove en la app. La pantalla de Proyectos solo lo
-- administra; el Master siempre puede aprobar aunque no tenga la fila.
create table if not exists public.user_capabilities (
  user_id    uuid not null references profiles(id) on delete cascade,
  capability text not null,
  granted_by uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, capability)
);
alter table user_capabilities enable row level security;
drop policy if exists ucaps_select on user_capabilities;
create policy ucaps_select on user_capabilities for select to authenticated using (true);
drop policy if exists ucaps_write on user_capabilities;
create policy ucaps_write on user_capabilities for all to authenticated
  using (hog_role() = 'MASTER') with check (hog_role() = 'MASTER');

notify pgrst, 'reload schema';
