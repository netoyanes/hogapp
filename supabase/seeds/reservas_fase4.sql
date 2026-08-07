-- ═════════════════════════════════════════════════════════════════════════════
-- RESERVAS · FASE 4 — Ciclo completo: no-show automático, sin-garantía a 24h,
-- lista de espera y alertas. Idempotente.
-- Requiere crear también la Edge Function 'reservations-cron' (ver repo:
-- supabase/functions/reservations-cron/index.ts) y el cron del final.
-- ═════════════════════════════════════════════════════════════════════════════

-- 1) Zona horaria por venue (el cron calcula la hora local de cada uno)
alter table business_units add column if not exists timezone text not null default 'America/Mazatlan';
-- Ajusta los venues de CDMX (hora del centro):
update business_units set timezone = 'America/Mexico_City' where code in ('PC', 'AR');

-- 2) Lista de espera real (walk-ins sin lugar; el host la gestiona en Reservas)
create table if not exists public.reservation_waitlist (
  id          uuid primary key default gen_random_uuid(),
  bu_id       uuid not null references business_units(id) on delete cascade,
  date        date not null default current_date,
  guest_name  text not null,
  phone       text,
  party_size  int not null default 2 check (party_size > 0),
  notes       text,
  status      text not null default 'waiting'
              check (status in ('waiting','converted','seated','expired')),
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists idx_rwaitlist_bu_date on reservation_waitlist (bu_id, date, status);

alter table reservation_waitlist enable row level security;
drop policy if exists rwaitlist_select on reservation_waitlist;
create policy rwaitlist_select on reservation_waitlist for select to authenticated using (true);
drop policy if exists rwaitlist_write on reservation_waitlist;
create policy rwaitlist_write on reservation_waitlist for all to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM','HEART_OF_HOUSE') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM','HEART_OF_HOUSE') and hog_has_venue(bu_id));

do $$ begin
  alter publication supabase_realtime add table reservation_waitlist;
exception when duplicate_object then null;
end $$;

-- 3) Cron cada 10 minutos → Edge Function reservations-cron
-- IGUAL que el dispatcher: reemplaza TU-REF y TU-SERVICE-ROLE-KEY (los mismos
-- valores que usaste en concierge_phase2.sql) antes de correr este bloque.
-- select cron.unschedule('reservations-cron') where exists (select 1 from cron.job where jobname = 'reservations-cron');
-- select cron.schedule(
--   'reservations-cron',
--   '*/10 * * * *',
--   $cron$
--   select net.http_post(
--     url := 'https://TU-REF.supabase.co/functions/v1/reservations-cron',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer TU-SERVICE-ROLE-KEY'
--     ),
--     body := '{}'::jsonb
--   );
--   $cron$
-- );
