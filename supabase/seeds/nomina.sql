-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · NÓMINA DE TEMPORALES Y EVENTUALES
--
-- El problema que resuelve: el personal eventual se contrata por volumen
-- operativo esperado, pero esa decisión hoy se toma de memoria. Sin el costo
-- por quincena contra el revenue del mismo periodo, nadie sabe si una noche
-- salió cara. Aquí se junta lo que cuesta la plantilla con lo que produjo.
--
--  · payroll_staff        plantilla: quién es, de qué venue, cuánto cobra
--  · payroll_periods      la quincena por venue, con su flujo de aprobación
--  · payroll_entries      el renglón de cada persona en esa quincena
--  · payroll_week_ops     la operación SEMANAL de cada persona (lo medible)
--  · fn_can_nomina()      quién ve el módulo
--  · fn_nomina_manager()  quién puede capturar de un venue
--
-- Arranca EXCLUSIVO del Master. Al liberar, basta con dar la app 'nomina' al
-- gerente en Usuarios y ligarlo a su venue en user_venues — las políticas ya
-- lo contemplan y solo lo dejarán tocar SUS venues.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Quién entra al módulo ────────────────────────────────────────────────────
create or replace function public.fn_can_nomina()
returns boolean language sql stable security definer set search_path = public as $$
  select hog_role() = 'MASTER'
      or exists (select 1 from user_apps where user_id = auth.uid() and app = 'nomina')
$$;

-- Quién puede CAPTURAR en un venue: el Master en todos; el gerente con la app
-- 'nomina', solo en los venues que tiene asignados en user_venues.
create or replace function public.fn_nomina_manager(p_bu uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select hog_role() = 'MASTER'
      or (
        exists (select 1 from user_apps where user_id = auth.uid() and app = 'nomina')
        and exists (select 1 from user_venues where user_id = auth.uid() and bu_id = p_bu)
      )
$$;

revoke all on function public.fn_can_nomina() from public;
revoke all on function public.fn_nomina_manager(uuid) from public;
grant execute on function public.fn_can_nomina() to authenticated;
grant execute on function public.fn_nomina_manager(uuid) to authenticated;

-- ── PLANTILLA — la gente ─────────────────────────────────────────────────────
-- Separada de profiles a propósito: un eventual no tiene cuenta en HOG APP ni
-- debe tenerla. Aquí vive como registro de nómina, no como usuario.
create table if not exists public.payroll_staff (
  id         uuid primary key default gen_random_uuid(),
  bu_id      uuid not null references business_units(id) on delete cascade,
  full_name  text not null,
  role       text,                                    -- mesero, barback, seguridad…
  kind       text not null default 'eventual'         -- temporal: recurrente por temporada
             check (kind in ('temporal', 'eventual')), -- eventual: por evento/turno suelto
  rate       numeric not null default 0 check (rate >= 0),  -- tarifa por turno
  phone      text,
  active     boolean not null default true,
  notes      text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_payroll_staff_bu on payroll_staff (bu_id) where active;

-- ── QUINCENA — el periodo por venue ──────────────────────────────────────────
-- Un renglón por venue y por quincena. El estado es el flujo: el gerente
-- captura (draft), la envía (submitted), el Master la aprueba (approved) y
-- cuando se dispersa queda pagada (paid). Aprobada no se edita.
create table if not exists public.payroll_periods (
  id           uuid primary key default gen_random_uuid(),
  bu_id        uuid not null references business_units(id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  status       text not null default 'draft'
               check (status in ('draft', 'submitted', 'approved', 'paid')),
  notes        text,
  submitted_by uuid references profiles(id) on delete set null,
  submitted_at timestamptz,
  approved_by  uuid references profiles(id) on delete set null,
  approved_at  timestamptz,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (bu_id, period_start)
);
create index if not exists idx_payroll_periods_bu on payroll_periods (bu_id, period_start desc);

-- ── RENGLÓN — cuánto le toca a cada quien en esa quincena ────────────────────
-- El total se guarda calculado (turnos × tarifa + bono − descuento) para que un
-- cambio de tarifa a futuro no reescriba la historia de lo ya pagado.
create table if not exists public.payroll_entries (
  id         uuid primary key default gen_random_uuid(),
  period_id  uuid not null references payroll_periods(id) on delete cascade,
  staff_id   uuid not null references payroll_staff(id) on delete cascade,
  shifts     numeric not null default 0 check (shifts >= 0),
  rate       numeric not null default 0 check (rate >= 0),
  bonus      numeric not null default 0,
  deduction  numeric not null default 0,
  total      numeric not null default 0,
  notes      text,
  created_at timestamptz not null default now(),
  unique (period_id, staff_id)
);
create index if not exists idx_payroll_entries_period on payroll_entries (period_id);

-- ── OPERACIÓN SEMANAL — lo que hace medible a cada persona ───────────────────
-- Es lo que la quincena NO dice: la quincena da el costo, esto da el
-- rendimiento. week_start siempre es lunes (se normaliza en la app).
create table if not exists public.payroll_week_ops (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references payroll_staff(id) on delete cascade,
  bu_id       uuid not null references business_units(id) on delete cascade,
  week_start  date not null,
  shifts      numeric not null default 0 check (shifts >= 0),
  hours       numeric not null default 0 check (hours >= 0),
  sales       numeric,                       -- venta atribuida, si el puesto la tiene
  incidents   int not null default 0,        -- retardos, faltas, reportes
  rating      int check (rating between 1 and 5),
  notes       text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (staff_id, week_start)
);
create index if not exists idx_payroll_week_ops_bu on payroll_week_ops (bu_id, week_start desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Leer: cualquiera que entre al módulo ve todo (el Master compara venues; el
-- gerente necesita referencia). Escribir: solo en los venues propios.
alter table payroll_staff    enable row level security;
alter table payroll_periods  enable row level security;
alter table payroll_entries  enable row level security;
alter table payroll_week_ops enable row level security;

drop policy if exists pstaff_select on payroll_staff;
create policy pstaff_select on payroll_staff for select to authenticated using (fn_can_nomina());
drop policy if exists pstaff_write on payroll_staff;
create policy pstaff_write on payroll_staff for all to authenticated
  using (fn_nomina_manager(bu_id)) with check (fn_nomina_manager(bu_id));

drop policy if exists pperiods_select on payroll_periods;
create policy pperiods_select on payroll_periods for select to authenticated using (fn_can_nomina());
drop policy if exists pperiods_write on payroll_periods;
create policy pperiods_write on payroll_periods for all to authenticated
  using (fn_nomina_manager(bu_id)) with check (fn_nomina_manager(bu_id));

-- Los renglones heredan el permiso de su quincena: sin subconsulta, un gerente
-- podría escribir renglones en la quincena de otro venue.
drop policy if exists pentries_select on payroll_entries;
create policy pentries_select on payroll_entries for select to authenticated using (fn_can_nomina());
drop policy if exists pentries_write on payroll_entries;
create policy pentries_write on payroll_entries for all to authenticated
  using (exists (select 1 from payroll_periods p where p.id = period_id and fn_nomina_manager(p.bu_id)))
  with check (exists (select 1 from payroll_periods p where p.id = period_id and fn_nomina_manager(p.bu_id)));

drop policy if exists pweekops_select on payroll_week_ops;
create policy pweekops_select on payroll_week_ops for select to authenticated using (fn_can_nomina());
drop policy if exists pweekops_write on payroll_week_ops;
create policy pweekops_write on payroll_week_ops for all to authenticated
  using (fn_nomina_manager(bu_id)) with check (fn_nomina_manager(bu_id));

-- ── El cruce con revenue ─────────────────────────────────────────────────────
-- El revenue ya vive en finance_income (Finanzas), pero esa tabla solo la lee
-- quien tiene Finanzas. Un gerente de nómina necesita el revenue de SU venue
-- para saber si su nómina es cara — y nada más que eso. Esta función devuelve
-- únicamente el total del rango, nunca los movimientos.
create or replace function public.fn_nomina_revenue(p_bu uuid, p_from date, p_to date)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)
  from finance_income
  where bu_id = p_bu and date between p_from and p_to
    and fn_nomina_manager(p_bu)
$$;
revoke all on function public.fn_nomina_revenue(uuid, date, date) from public;
grant execute on function public.fn_nomina_revenue(uuid, date, date) to authenticated;

-- Revenue por venue y por quincena, de una sola llamada — para el resumen del
-- Master, que necesita las 13 unidades a la vez sin 13 viajes de red.
create or replace function public.fn_nomina_revenue_bulk(p_from date, p_to date)
returns table (bu_id uuid, total numeric)
language sql stable security definer set search_path = public as $$
  select i.bu_id, coalesce(sum(i.amount), 0)
  from finance_income i
  where i.date between p_from and p_to and fn_nomina_manager(i.bu_id)
  group by i.bu_id
$$;
revoke all on function public.fn_nomina_revenue_bulk(date, date) from public;
grant execute on function public.fn_nomina_revenue_bulk(date, date) to authenticated;

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- PARA LIBERARLO A LOS GERENTES (cuando decidas):
--   1. Usuarios → al gerente, asígnale la app 'nomina'
--   2. Asegúrate de que esté ligado a su venue en user_venues
-- Con eso ve el módulo y captura SOLO lo de sus venues. No hay que tocar SQL.
-- ─────────────────────────────────────────────────────────────────────────────
