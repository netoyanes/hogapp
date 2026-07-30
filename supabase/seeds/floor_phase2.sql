-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Plataforma de reservas multi-venue — FASE 2: Piso operativo en vivo
-- El plano del editor se vuelve la vista del host: cada mesa muestra su estado
-- (libre / reservada / sentada / en cuenta) y desde ahí se sienta y se cierra.
-- table_sessions registra las horas REALES de sentada/cuenta/salida — esa es la
-- materia prima de la calibración de duraciones (Fase 5).
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.table_sessions (
  id             uuid primary key default gen_random_uuid(),
  bu_id          uuid not null references business_units(id) on delete cascade,
  zone_id        uuid not null references venue_zones(id) on delete cascade,
  table_id       uuid references venue_tables(id) on delete cascade,   -- null = barra
  reservation_id uuid references reservations(id) on delete set null,  -- null = walk-in
  guest_name     text,                                                 -- walk-in sin reserva
  party_size     int not null default 2 check (party_size > 0),
  status         text not null default 'seated' check (status in ('seated','billing','closed')),
  seated_at      timestamptz not null default now(),                   -- hora REAL de sentada
  billing_at     timestamptz,                                          -- hora en que pidió cuenta
  closed_at      timestamptz,                                          -- hora REAL de salida
  created_by     uuid
);
create index if not exists idx_tsessions_bu_open on table_sessions (bu_id, status);
create index if not exists idx_tsessions_table on table_sessions (table_id);
create index if not exists idx_tsessions_res on table_sessions (reservation_id);

-- ─── RLS: lectura app; opera cualquier rol con acceso al venue ───────────────
alter table table_sessions enable row level security;

drop policy if exists tsessions_select on table_sessions;
create policy tsessions_select on table_sessions for select to authenticated using (true);
drop policy if exists tsessions_write on table_sessions;
create policy tsessions_write on table_sessions for all to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM','HEART_OF_HOUSE') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM','HEART_OF_HOUSE') and hog_has_venue(bu_id));

-- ─── Realtime: el piso se actualiza solo en todas las tablets ────────────────
do $$ begin
  alter publication supabase_realtime add table table_sessions;
exception when duplicate_object then null;
end $$;
