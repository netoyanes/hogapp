-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · FINANZAS — espacio exclusivo del Master (acceso otorgable solo por
-- él vía apps por usuario, app 'finanzas'):
--  · finance_locations: mapeo BU ↔ sucursal BANX (slug) + checkpoint de sync
--  · finance_income:    ingresos capturados (para "cuánto gano en el tiempo")
--  · finance_orders:    espejo de órdenes de pago BANX (gastos y PASIVOS)
--  · finance_payroll_runs: espejo de corridas de nómina BANX
--  · finance_balances:  fotos del saldo BANX
--  · finance_webhook_events: dedup de webhooks (X-Banx-Delivery-Id)
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ¿Puede este usuario ver Finanzas? Master, o app 'finanzas' asignada por él
create or replace function public.fn_can_finanzas()
returns boolean language sql stable security definer set search_path = public as $$
  select hog_role() = 'MASTER'
      or exists (select 1 from user_apps where user_id = auth.uid() and app = 'finanzas')
$$;

create table if not exists public.finance_locations (
  id               uuid primary key default gen_random_uuid(),
  bu_id            uuid not null unique references business_units(id) on delete cascade,
  banx_slug        text not null,
  banx_location_id uuid,          -- uuid de BANX (se llena en el primer sync)
  active           boolean not null default true,
  last_sync        text,          -- updated_at máximo visto, tal cual lo dio la API
  created_at       timestamptz not null default now()
);
alter table finance_locations enable row level security;
drop policy if exists finloc_select on finance_locations;
create policy finloc_select on finance_locations for select using (fn_can_finanzas());
drop policy if exists finloc_write on finance_locations;
create policy finloc_write on finance_locations for all to authenticated
  using (hog_role() = 'MASTER') with check (hog_role() = 'MASTER');

create table if not exists public.finance_income (
  id         uuid primary key default gen_random_uuid(),
  bu_id      uuid not null references business_units(id) on delete cascade,
  date       date not null,
  amount     numeric not null check (amount > 0),
  source     text,               -- barra, cover, eventos, tienda…
  notes      text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_finance_income_bu on finance_income (bu_id, date desc);
alter table finance_income enable row level security;
drop policy if exists finincome_all on finance_income;
create policy finincome_all on finance_income for all to authenticated
  using (fn_can_finanzas()) with check (fn_can_finanzas());

create table if not exists public.finance_orders (
  id                uuid primary key,   -- id BANX
  bu_id             uuid not null references business_units(id) on delete cascade,
  external_id       text,
  sequential_number int,
  beneficiary       text,
  bank              text,
  clabe_last4       text,
  amount            numeric not null,
  iva               numeric,
  concept           text,
  reference         text,
  invoice_number    text,
  payment_date      date,
  expense_type      text,
  priority          text,
  payment_method    text,
  status            text not null,
  rejection_reason  text,
  cancel_reason     text,
  stp_tracking_key  text,
  folio_solicitud   text,
  origin            text,
  banx_created_at   timestamptz,
  banx_updated_at   timestamptz,
  synced_at         timestamptz not null default now()
);
create index if not exists idx_finance_orders_bu on finance_orders (bu_id, status);
create index if not exists idx_finance_orders_date on finance_orders (bu_id, banx_created_at desc);
alter table finance_orders enable row level security;
drop policy if exists finorders_select on finance_orders;
create policy finorders_select on finance_orders for select using (fn_can_finanzas());
-- escrituras: solo la edge function (service role)

create table if not exists public.finance_payroll_runs (
  id               uuid primary key,   -- id BANX
  bu_id            uuid not null references business_units(id) on delete cascade,
  pay_date         date,
  period_start     date,
  period_end       date,
  status           text,
  total_amount     numeric,
  employee_count   int,
  rejection_reason text,
  banx_updated_at  timestamptz,
  synced_at        timestamptz not null default now()
);
create index if not exists idx_finance_payroll_bu on finance_payroll_runs (bu_id, pay_date desc);
alter table finance_payroll_runs enable row level security;
drop policy if exists finpayroll_select on finance_payroll_runs;
create policy finpayroll_select on finance_payroll_runs for select using (fn_can_finanzas());

create table if not exists public.finance_balances (
  id              uuid primary key default gen_random_uuid(),
  bu_id           uuid not null references business_units(id) on delete cascade,
  taken_at        timestamptz not null default now(),
  available       numeric,
  closing_balance numeric,
  reserved        numeric
);
create index if not exists idx_finance_balances_bu on finance_balances (bu_id, taken_at desc);
alter table finance_balances enable row level security;
drop policy if exists finbal_select on finance_balances;
create policy finbal_select on finance_balances for select using (fn_can_finanzas());

create table if not exists public.finance_webhook_events (
  id          text primary key,   -- X-Banx-Delivery-Id
  received_at timestamptz not null default now()
);
alter table finance_webhook_events enable row level security;
-- solo service role la toca; sin policies de authenticated
