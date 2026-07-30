-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Plataforma de reservas multi-venue — FASE 1: Zonas y mesas
-- Cada venue define sus zonas (mesas o barra) y su plano de piso. La capacidad
-- total del venue se calcula sumando el mobiliario activo — nunca a mano.
-- El motor de disponibilidad por mesa llega en Fase 3; mientras, el motor de
-- cupo por noche sigue operando (rollout por venue).
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Zonas ───────────────────────────────────────────────────────────────────
create table if not exists public.venue_zones (
  id                uuid primary key default gen_random_uuid(),
  bu_id             uuid not null references business_units(id) on delete cascade,
  name              text not null,                    -- "Sala 1", "Terraza", "Barra"…
  kind              text not null default 'mesas' check (kind in ('mesas','barra')),
  reservable_online boolean not null default true,    -- barra suele ser walk-in
  priority          int not null default 0,           -- orden de auto-asignación
  open_time         text,                             -- horario propio opcional 'HH:MM'
  close_time        text,
  status            text not null default 'active' check (status in ('active','closed')),
  bar_seats         int not null default 0,           -- solo kind='barra': asientos
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_vzones_bu on venue_zones (bu_id, priority);

-- ─── Mesas / mobiliario ──────────────────────────────────────────────────────
create table if not exists public.venue_tables (
  id          uuid primary key default gen_random_uuid(),
  bu_id       uuid not null references business_units(id) on delete cascade,
  zone_id     uuid not null references venue_zones(id) on delete cascade,
  name        text not null,                          -- "M1", "Booth 2"…
  min_pax     int not null default 1,
  max_pax     int not null default 2,
  shape       text not null default 'square'
              check (shape in ('square','round','booth','lounge','high')),
  x           numeric not null default 10,            -- posición % en el lienzo
  y           numeric not null default 10,
  w           numeric not null default 12,            -- tamaño % en el lienzo
  h           numeric not null default 12,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (min_pax <= max_pax)
);
create index if not exists idx_vtables_zone on venue_tables (zone_id);
create index if not exists idx_vtables_bu on venue_tables (bu_id, active);

-- ─── Combinaciones (las define el gerente, solo mesas contiguas) ─────────────
create table if not exists public.table_combinations (
  id          uuid primary key default gen_random_uuid(),
  bu_id       uuid not null references business_units(id) on delete cascade,
  zone_id     uuid not null references venue_zones(id) on delete cascade,
  name        text not null,                          -- "M3+M4"
  table_ids   uuid[] not null,
  min_pax     int not null,
  max_pax     int not null,
  created_at  timestamptz not null default now(),
  check (min_pax <= max_pax)
);
create index if not exists idx_tcombos_bu on table_combinations (bu_id);

-- ─── Reservas: asignación a zona/mesa (nullable — Fase 3 la usa el motor) ────
alter table reservations add column if not exists zone_id  uuid references venue_zones(id)  on delete set null;
alter table reservations add column if not exists table_id uuid references venue_tables(id) on delete set null;

-- ─── Triggers updated_at ─────────────────────────────────────────────────────
drop trigger if exists trg_vzones_touch on venue_zones;
create trigger trg_vzones_touch before update on venue_zones
  for each row execute function touch_updated_at();
drop trigger if exists trg_vtables_touch on venue_tables;
create trigger trg_vtables_touch before update on venue_tables
  for each row execute function touch_updated_at();

-- ─── RLS: lectura app; escritura gerente (Ops/Master) de su venue ────────────
alter table venue_zones enable row level security;
alter table venue_tables enable row level security;
alter table table_combinations enable row level security;

drop policy if exists vzones_select on venue_zones;
create policy vzones_select on venue_zones for select to authenticated using (true);
drop policy if exists vzones_write on venue_zones;
create policy vzones_write on venue_zones for all to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id));

drop policy if exists vtables_select on venue_tables;
create policy vtables_select on venue_tables for select to authenticated using (true);
drop policy if exists vtables_write on venue_tables;
create policy vtables_write on venue_tables for all to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id));

drop policy if exists tcombos_select on table_combinations;
create policy tcombos_select on table_combinations for select to authenticated using (true);
drop policy if exists tcombos_write on table_combinations;
create policy tcombos_write on table_combinations for all to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id));
