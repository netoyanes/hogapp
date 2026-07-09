-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Concierge multi-tipo de venue — Fase 1 (adaptada al esquema real)
-- 5 tipos de venue, 4 modelos de inventario. Bruma (fnb/nightly_capacity) no
-- cambia en nada: todo defaultea a su modelo actual y el trigger no le exige
-- columnas nuevas.
-- Adaptaciones vs. el spec original: la tabla de venues es business_units;
-- enums como text+CHECK (estilo del proyecto); horas como text 'HH:MM'
-- (igual que reservations.time_slot).
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Tipo de venue y modelo de inventario ────────────────────────────────────
alter table business_units add column if not exists venue_type text not null default 'fnb'
  check (venue_type in ('fnb','dance_club','wellness','art_house','boutique_hospitality'));
alter table business_units add column if not exists inventory_type text not null default 'nightly_capacity'
  check (inventory_type in ('nightly_capacity','time_slots','event_rsvp','unit_stay'));
alter table business_units add column if not exists reservation_policy jsonb not null default '{}';
-- Claves de reservation_policy en uso: cancel_window_hours (wellness),
-- check_in_time / check_out_time (boutique), notes (texto libre para el bot).

-- Backfill explícito (los defaults ya cubren, pero que quede sin ambigüedad)
update business_units set venue_type = 'fnb' where venue_type is null;
update business_units set inventory_type = 'nightly_capacity' where inventory_type is null;

-- ─── WELLNESS: servicios → horarios semanales → slots (get-or-create) ────────
-- Los slots NO se pre-generan: buscar_disponibilidad calcula los horarios del
-- día desde service_schedules, y la fila en service_slots se crea cuando
-- alguien reserva ese horario por primera vez.
create table if not exists public.venue_services (
  id                uuid primary key default gen_random_uuid(),
  bu_id             uuid not null references business_units(id) on delete cascade,
  name              text not null,                    -- "Masaje deep tissue", "Clase de yoga"
  description       text,
  duration_minutes  int not null default 60,
  capacity_per_slot int not null default 1,           -- 1 = individual; >1 = clase grupal
  price             numeric,                          -- MXN, informativo para el bot
  active            boolean not null default true,
  sort              int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_vsvc_bu on venue_services (bu_id, active);

create table if not exists public.service_schedules (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references venue_services(id) on delete cascade,
  day_of_week int  not null check (day_of_week between 0 and 6),   -- 0 = domingo
  start_time  text not null check (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  active      boolean not null default true,
  unique (service_id, day_of_week, start_time)
);
create index if not exists idx_ssched_svc on service_schedules (service_id, day_of_week);

create table if not exists public.service_slots (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references venue_services(id) on delete cascade,
  bu_id       uuid not null references business_units(id) on delete cascade,
  date        date not null,
  start_time  text not null check (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  capacity    int  not null,
  created_at  timestamptz not null default now(),
  unique (service_id, date, start_time)
);
create index if not exists idx_sslot_day on service_slots (bu_id, date);

-- ─── ART HOUSE: cartelera de eventos con RSVP ────────────────────────────────
create table if not exists public.venue_events (
  id          uuid primary key default gen_random_uuid(),
  bu_id       uuid not null references business_units(id) on delete cascade,
  name        text not null,                          -- "Noche de jazz", "Expo apertura"
  date        date not null,
  start_time  text not null default '20:00' check (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  capacity    int  not null default 50,
  description text,
  status      text not null default 'draft'
              check (status in ('draft','announced','sold_out','cancelled','past')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_vevents_board on venue_events (bu_id, date, status);

-- ─── BOUTIQUE HOSPITALITY: unidades (pods, suites, cabañas) ──────────────────
create table if not exists public.venue_units (
  id          uuid primary key default gen_random_uuid(),
  bu_id       uuid not null references business_units(id) on delete cascade,
  name        text not null,                          -- "Pod 1", "Suite Mar"
  unit_type   text,                                   -- "pod", "suite", "cabaña"
  capacity    int  not null default 2,                -- pax máx de la unidad
  base_rate   numeric not null default 0,             -- MXN por noche
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_vunits_bu on venue_units (bu_id, active);

-- ─── Reservas: columnas por modelo (nullable — nightly no usa ninguna) ───────
alter table reservations add column if not exists service_slot_id uuid references service_slots(id) on delete set null;
alter table reservations add column if not exists event_id        uuid references venue_events(id)  on delete set null;
alter table reservations add column if not exists unit_id         uuid references venue_units(id)   on delete set null;
alter table reservations add column if not exists check_in        date;
alter table reservations add column if not exists check_out       date;
create index if not exists idx_res_slot  on reservations (service_slot_id) where service_slot_id is not null;
create index if not exists idx_res_event on reservations (event_id)        where event_id is not null;
create index if not exists idx_res_unit  on reservations (unit_id, check_in, check_out) where unit_id is not null;

-- Trigger de integridad: cada reserva trae lo que su modelo de inventario
-- exige. nightly_capacity (Bruma) no exige nada — cero fricción.
create or replace function public.fn_reservation_inventory_check() returns trigger
language plpgsql as $$
declare inv text;
begin
  select inventory_type into inv from business_units where id = new.bu_id;
  if inv = 'time_slots' and new.service_slot_id is null then
    raise exception 'Reserva de venue time_slots requiere service_slot_id';
  elsif inv = 'event_rsvp' and new.event_id is null then
    raise exception 'Reserva de venue event_rsvp requiere event_id';
  elsif inv = 'unit_stay' then
    if new.unit_id is null or new.check_in is null or new.check_out is null then
      raise exception 'Reserva de venue unit_stay requiere unit_id, check_in y check_out';
    end if;
    if new.check_out <= new.check_in then
      raise exception 'check_out debe ser posterior a check_in';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_res_inventory on reservations;
create trigger trg_res_inventory before insert or update on reservations
  for each row execute function fn_reservation_inventory_check();

-- ─── Funciones de disponibilidad ─────────────────────────────────────────────
-- Lugares libres en un slot (capacidad - pax de reservas vivas)
create or replace function public.fn_slot_availability(slot_id uuid) returns int
language sql stable as $$
  select s.capacity - coalesce((
    select sum(r.party_size) from reservations r
    where r.service_slot_id = s.id and r.status in ('requested','confirmed','seated')
  ), 0)
  from service_slots s where s.id = slot_id
$$;

-- Lugares libres en un evento
create or replace function public.fn_event_availability(event_id uuid) returns int
language sql stable as $$
  select e.capacity - coalesce((
    select sum(r.party_size) from reservations r
    where r.event_id = e.id and r.status in ('requested','confirmed','seated')
  ), 0)
  from venue_events e where e.id = event_id
$$;

-- ¿La unidad está libre en el rango? (solape estándar: in < out ajenos)
create or replace function public.fn_unit_available(unit uuid, cin date, cout date) returns boolean
language sql stable as $$
  select not exists (
    select 1 from reservations r
    where r.unit_id = unit
      and r.status in ('requested','confirmed','seated')
      and r.check_in < cout and r.check_out > cin
  )
$$;

-- ─── Triggers updated_at ─────────────────────────────────────────────────────
drop trigger if exists trg_vsvc_touch on venue_services;
create trigger trg_vsvc_touch before update on venue_services
  for each row execute function touch_updated_at();
drop trigger if exists trg_vevents_touch on venue_events;
create trigger trg_vevents_touch before update on venue_events
  for each row execute function touch_updated_at();
drop trigger if exists trg_vunits_touch on venue_units;
create trigger trg_vunits_touch before update on venue_units
  for each row execute function touch_updated_at();

-- ─── RLS: lectura para la app; escritura Ops/Master. El bot usa service role ─
alter table venue_services enable row level security;
alter table service_schedules enable row level security;
alter table service_slots enable row level security;
alter table venue_events enable row level security;
alter table venue_units enable row level security;

drop policy if exists vsvc_select on venue_services;
create policy vsvc_select on venue_services for select to authenticated using (true);
drop policy if exists vsvc_write on venue_services;
create policy vsvc_write on venue_services for all to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id));

drop policy if exists ssched_select on service_schedules;
create policy ssched_select on service_schedules for select to authenticated using (true);
drop policy if exists ssched_write on service_schedules;
create policy ssched_write on service_schedules for all to authenticated
  using (exists (select 1 from venue_services s where s.id = service_id
                 and hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(s.bu_id)))
  with check (exists (select 1 from venue_services s where s.id = service_id
                 and hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(s.bu_id)));

drop policy if exists sslot_select on service_slots;
create policy sslot_select on service_slots for select to authenticated using (true);
drop policy if exists sslot_write on service_slots;
create policy sslot_write on service_slots for all to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id));

drop policy if exists vevents_select on venue_events;
create policy vevents_select on venue_events for select to authenticated using (true);
drop policy if exists vevents_write on venue_events;
create policy vevents_write on venue_events for all to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id));

drop policy if exists vunits_select on venue_units;
create policy vunits_select on venue_units for select to authenticated using (true);
drop policy if exists vunits_write on venue_units;
create policy vunits_write on venue_units for all to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id));
