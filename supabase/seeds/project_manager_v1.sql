-- ═════════════════════════════════════════════════════════════════════════════
-- PROJECT MANAGER v1 — lo que la base necesita para que el proyecto "diga solo
-- en qué va" (Mieruka: el estado se ve sin abrir nada y sin preguntar).
--
--   1. Bloqueo explícito en la tarea (andon): quien se atora dice por qué.
--   2. Fecha del último cambio de estado: para ver cuánto lleva algo quieto.
--   3. Cliente interno / externo del proyecto.
--   4. Dos tipos de proyecto más: campaña e interno.
--
-- La SALUD del proyecto (atorado / en riesgo / fluye) NO vive aquí: se deriva
-- en la app (src/lib/projectHealth.ts) de estas columnas y de las que ya
-- existían (due_date, deadline_type, assigned_to, status, fechas de la
-- actividad). Una sola fuente de reglas, pintada igual en todos lados.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1. Andon: "Estoy atorado" con causa ─────────────────────────────────────
alter table tasks add column if not exists blocked_reason text;
alter table tasks add column if not exists blocked_at     timestamptz;
alter table tasks add column if not exists blocked_by     uuid references profiles(id) on delete set null;

-- ─── 2. Edad en el mismo estado ──────────────────────────────────────────────
alter table tasks add column if not exists status_changed_at timestamptz;
update tasks set status_changed_at = coalesce(updated_at, created_at, now())
 where status_changed_at is null;

create or replace function public.fn_tasks_status_changed()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
    -- Aprobar una tarea la desbloquea: un bloqueo sobre algo terminado es ruido
    if new.status = 'APPROVED' then
      new.blocked_reason := null; new.blocked_at := null; new.blocked_by := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_tasks_status_changed on tasks;
create trigger trg_tasks_status_changed before update on tasks
  for each row execute function public.fn_tasks_status_changed();

create index if not exists idx_tasks_blocked on tasks (event_id) where blocked_reason is not null;

-- ─── 3. Tarea ↔ actividad (por si project_program.sql no se corrió) ─────────
do $$ begin
  if to_regclass('public.project_activities') is not null then
    alter table tasks add column if not exists activity_id uuid references project_activities(id) on delete set null;
    create index if not exists idx_tasks_activity on tasks (activity_id) where activity_id is not null;
  end if;
end $$;

-- ─── 4. Proyecto: cliente y tipos nuevos ─────────────────────────────────────
alter table event_plans add column if not exists client_kind text not null default 'interno';
alter table event_plans drop constraint if exists event_plans_client_kind_check;
alter table event_plans add constraint event_plans_client_kind_check
  check (client_kind in ('interno','externo'));

alter table event_plans drop constraint if exists event_plans_kind_check;
alter table event_plans add constraint event_plans_kind_check
  check (kind in ('evento','campana','adecuacion','remodelacion','apertura','mantenimiento','interno','otro'));

notify pgrst, 'reload schema';
