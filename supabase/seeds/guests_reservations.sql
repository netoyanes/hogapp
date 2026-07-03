-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Fase 1+2 — Guests + Reservations
-- Paso 1 del build sequence: schema + RLS + triggers + seeds.
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente (IF NOT EXISTS /
-- OR REPLACE / ON CONFLICT) — se puede correr más de una vez sin romper nada.
--
-- Decisiones documentadas:
-- · Cumpleaños con año opcional: una sola columna `birthday date` + flag
--   `birthday_has_year`. Si el año no se conoce se guarda con año 2000
--   (bisiesto, soporta 29/feb) y el flag en false.
-- · "Sus venues" (Ops/Team) requiere un mapeo usuario↔venue que NO existía:
--   se crea `user_venues` (lo administra MASTER). Bootstrap: un usuario SIN
--   filas asignadas ve todos los venues (evita bloquear al equipo el día 1;
--   en cuanto se asignan filas, se restringe).
-- · Dedupe global por teléfono exige que TEAM pueda leer todos los guests;
--   el detalle de visitas cross-venue se restringe en `guest_visits` (RLS) y
--   los conteos llegan por vistas agregadas (solo números, no detalle).
-- · Enums como text + CHECK (estilo del schema existente).
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Helpers de rol/venue ────────────────────────────────────────────────────
create or replace function public.hog_role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create table if not exists public.user_venues (
  user_id uuid not null references profiles(id) on delete cascade,
  bu_id   uuid not null references business_units(id) on delete cascade,
  primary key (user_id, bu_id)
);

create or replace function public.hog_has_venue(bu uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select hog_role() in ('MASTER','C_LEVEL')
      or not exists (select 1 from user_venues uv where uv.user_id = auth.uid())
      or exists (select 1 from user_venues uv where uv.user_id = auth.uid() and uv.bu_id = bu)
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ─── GUESTS (clientes consumidores — separados 100% del directorio B2B) ─────
create table if not exists public.guests (
  id                 uuid primary key default gen_random_uuid(),
  phone              text not null unique
                     check (phone ~ '^\+[1-9][0-9]{7,14}$'),      -- E.164
  full_name          text not null,
  email              text,
  birthday           date,
  birthday_has_year  boolean not null default true,
  origin_bu          uuid references business_units(id),
  created_by         uuid references profiles(id),                 -- finder
  tags               text[] not null default '{}',
  notes              text,
  consent_terms      boolean not null default false,               -- requerido al crear (UI)
  consent_terms_at   timestamptz,
  consent_marketing  boolean not null default false,               -- opt-in, nunca pre-marcado
  consent_marketing_at timestamptz,
  status             text not null default 'active'
                     check (status in ('active','archived','anonymized')),
  -- Hooks de recompensas (Fase 3-4): columnas listas, CERO lógica hoy
  qr_token           text,
  wallet_pass_id     text,
  loyalty_tier       text,
  points_balance     int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_guests_name   on guests (lower(full_name));
create index if not exists idx_guests_status on guests (status);

drop trigger if exists trg_guests_touch on guests;
create trigger trg_guests_touch before update on guests
  for each row execute function touch_updated_at();

-- Opciones de tags sugeridas (lista editable por MASTER)
create table if not exists public.guest_tag_options (
  id     uuid primary key default gen_random_uuid(),
  label  text not null unique,
  active boolean not null default true
);

-- ─── GUEST VISITS (base del futuro programa de recompensas) ─────────────────
create table if not exists public.guest_visits (
  id             uuid primary key default gen_random_uuid(),
  guest_id       uuid not null references guests(id) on delete cascade,
  bu_id          uuid not null references business_units(id),
  visit_date     date not null default current_date,
  source         text not null default 'manual'
                 check (source in ('reservation','walk_in','manual')),
  reservation_id uuid,                                             -- FK abajo
  registered_by  uuid references profiles(id),
  created_at     timestamptz not null default now()
);
create index if not exists idx_visits_guest on guest_visits (guest_id, visit_date desc);
create index if not exists idx_visits_bu    on guest_visits (bu_id, visit_date desc);
-- Una visita máximo por reservación (evita doble captura)
create unique index if not exists uq_visits_reservation
  on guest_visits (reservation_id) where reservation_id is not null;

-- ─── RESERVATIONS ────────────────────────────────────────────────────────────
create table if not exists public.reservations (
  id                uuid primary key default gen_random_uuid(),
  guest_id          uuid not null references guests(id),
  bu_id             uuid not null references business_units(id),
  date              date not null,
  time_slot         text not null,                                 -- ej. '19:00–20:30'
  party_size        int  not null check (party_size > 0),
  zone              text,
  status            text not null default 'requested'
                    check (status in ('requested','confirmed','seated','completed','no_show','cancelled')),
  source            text not null default 'phone'
                    check (source in ('phone','whatsapp','instagram','walk_in','internal')),
  notes             text,
  cancel_reason     text,
  overbooked_by     uuid references profiles(id),                  -- sobrecupo autorizado por
  created_by        uuid references profiles(id),
  status_changed_by uuid references profiles(id),
  confirmed_at      timestamptz,
  seated_at         timestamptz,
  completed_at      timestamptz,
  no_show_at        timestamptz,
  cancelled_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_res_board on reservations (bu_id, date, time_slot);
create index if not exists idx_res_guest on reservations (guest_id, date desc);

alter table guest_visits
  drop constraint if exists guest_visits_reservation_fk;
alter table guest_visits
  add constraint guest_visits_reservation_fk
  foreign key (reservation_id) references reservations(id) on delete set null;

-- Máquina de estados: sella timestamps y AUTO-CREA la visita al completar.
-- Nunca doble captura: el índice único por reservación lo garantiza.
create or replace function public.reservation_status_effects() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    case new.status
      when 'confirmed' then new.confirmed_at := coalesce(new.confirmed_at, now());
      when 'seated'    then new.seated_at    := coalesce(new.seated_at, now());
      when 'completed' then new.completed_at := coalesce(new.completed_at, now());
      when 'no_show'   then new.no_show_at   := coalesce(new.no_show_at, now());
      when 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now());
      else null;
    end case;
    if new.status = 'completed' then
      insert into guest_visits (guest_id, bu_id, visit_date, source, reservation_id, registered_by)
      values (new.guest_id, new.bu_id, new.date, 'reservation', new.id, new.status_changed_by)
      on conflict (reservation_id) where reservation_id is not null do nothing;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_res_status on reservations;
create trigger trg_res_status before update on reservations
  for each row execute function reservation_status_effects();

-- ─── VENUE CAPACITY (slots simples, sin mapas de mesas) ─────────────────────
create table if not exists public.venue_capacity (
  id               uuid primary key default gen_random_uuid(),
  bu_id            uuid not null references business_units(id) on delete cascade,
  day_of_week      int  not null check (day_of_week between 0 and 6),  -- 0=domingo
  time_slot        text not null,
  max_reservations int  not null default 10,
  max_pax          int  not null default 60,
  active           boolean not null default true,
  unique (bu_id, day_of_week, time_slot)
);

-- ─── VISTAS DERIVADAS (conteos; corren como owner → solo números, sin RLS) ──
create or replace view public.guest_stats as
select
  g.id as guest_id,
  count(v.id)::int                                                      as total_visits,
  max(v.visit_date)                                                     as last_visit,
  (select count(*)::int from reservations r where r.guest_id = g.id and r.status = 'no_show')   as no_shows,
  (select count(*)::int from reservations r where r.guest_id = g.id and r.status = 'cancelled') as cancellations,
  (select count(*)::int from reservations r where r.guest_id = g.id and r.status = 'completed') as completed_reservations
from guests g
left join guest_visits v on v.guest_id = g.id
group by g.id;

create or replace view public.guest_venue_stats as
select v.guest_id, v.bu_id, count(*)::int as visits, max(v.visit_date) as last_visit
from guest_visits v group by v.guest_id, v.bu_id;

grant select on public.guest_stats, public.guest_venue_stats to authenticated;

-- ─── ANONIMIZAR (LFPDPPP) — irreversible, conserva filas para estadística ───
create or replace function public.anonymize_guest(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if hog_role() <> 'MASTER' then
    raise exception 'Solo MASTER puede anonimizar clientes';
  end if;
  update guests set
    full_name = 'Cliente eliminado',
    phone     = '+999' || lpad((abs(hashtext(gid::text)) % 1000000000)::text, 9, '0'),
    email = null, birthday = null, notes = null, tags = '{}',
    consent_marketing = false, consent_marketing_at = null,
    qr_token = null, wallet_pass_id = null, loyalty_tier = null,
    status = 'anonymized', updated_at = now()
  where id = gid;
end $$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table user_venues       enable row level security;
alter table guests            enable row level security;
alter table guest_tag_options enable row level security;
alter table guest_visits      enable row level security;
alter table reservations      enable row level security;
alter table venue_capacity    enable row level security;

-- user_venues: cada quien ve lo suyo; MASTER administra
drop policy if exists uv_select on user_venues;
create policy uv_select on user_venues for select to authenticated
  using (user_id = auth.uid() or hog_role() = 'MASTER');
drop policy if exists uv_write on user_venues;
create policy uv_write on user_venues for all to authenticated
  using (hog_role() = 'MASTER') with check (hog_role() = 'MASTER');

-- guests: Marketing SOLO con consentimiento (a nivel RLS); demás roles leen todo
drop policy if exists guests_select on guests;
create policy guests_select on guests for select to authenticated
  using (
    case hog_role()
      when 'MARKETING' then consent_marketing = true and status = 'active'
      else true
    end
  );
drop policy if exists guests_insert on guests;
create policy guests_insert on guests for insert to authenticated
  with check (hog_role() in ('MASTER','OPS_MANAGER','TEAM') and status = 'active');
drop policy if exists guests_update_admin on guests;
create policy guests_update_admin on guests for update to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER'))
  with check (hog_role() in ('MASTER','OPS_MANAGER'));
drop policy if exists guests_update_team on guests;   -- Team edita pero NO archiva
create policy guests_update_team on guests for update to authenticated
  using (hog_role() = 'TEAM' and status = 'active')
  with check (status = 'active');
drop policy if exists guests_delete on guests;
create policy guests_delete on guests for delete to authenticated
  using (hog_role() = 'MASTER');

-- tags: todos leen; MASTER administra
drop policy if exists tags_select on guest_tag_options;
create policy tags_select on guest_tag_options for select to authenticated using (true);
drop policy if exists tags_write on guest_tag_options;
create policy tags_write on guest_tag_options for all to authenticated
  using (hog_role() = 'MASTER') with check (hog_role() = 'MASTER');

-- guest_visits: detalle solo en tus venues (Team); Marketing sin detalle
drop policy if exists visits_select on guest_visits;
create policy visits_select on guest_visits for select to authenticated
  using (
    case hog_role()
      when 'MARKETING' then false
      when 'TEAM'      then hog_has_venue(bu_id)
      else true
    end
  );
drop policy if exists visits_insert on guest_visits;
create policy visits_insert on guest_visits for insert to authenticated
  with check (hog_role() in ('MASTER','OPS_MANAGER','TEAM') and hog_has_venue(bu_id));
drop policy if exists visits_delete on guest_visits;
create policy visits_delete on guest_visits for delete to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id));

-- reservations: Ops/Team en sus venues; C-Level/Marketing solo lectura
drop policy if exists res_select on reservations;
create policy res_select on reservations for select to authenticated
  using (
    case hog_role()
      when 'MASTER' then true when 'C_LEVEL' then true when 'MARKETING' then true
      else hog_has_venue(bu_id)
    end
  );
drop policy if exists res_insert on reservations;
create policy res_insert on reservations for insert to authenticated
  with check (hog_role() in ('MASTER','OPS_MANAGER','TEAM') and hog_has_venue(bu_id));
drop policy if exists res_update on reservations;
create policy res_update on reservations for update to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER','TEAM') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','OPS_MANAGER','TEAM') and hog_has_venue(bu_id));
drop policy if exists res_delete on reservations;   -- Team NO borra
create policy res_delete on reservations for delete to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id));

-- venue_capacity: todos leen; Ops+ escribe en sus venues
drop policy if exists cap_select on venue_capacity;
create policy cap_select on venue_capacity for select to authenticated using (true);
drop policy if exists cap_write on venue_capacity;
create policy cap_write on venue_capacity for all to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id));

-- ─── REALTIME (boards en vivo entre tablet del host y teléfono del manager) ─
do $$ begin
  alter publication supabase_realtime add table reservations;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table guests;
exception when duplicate_object then null; end $$;

-- ─── SEEDS ───────────────────────────────────────────────────────────────────
insert into guest_tag_options (label) values
  ('VIP'), ('Alergia'), ('Preferencia terraza'), ('Corporativo'), ('Influencer')
on conflict (label) do nothing;

-- Umbral para el puente CRM (pax ≥ N → sugerir deal Evento)
insert into app_settings (key, value) values ('reservation_event_pax_threshold', '15')
on conflict (key) do nothing;
-- Feature flag de la sección Recompensas del perfil (apagado)
insert into app_settings (key, value) values ('rewards_section_enabled', 'false')
on conflict (key) do nothing;

-- Capacidad para 3 venues (AJ, BM, PC): jue-sáb, 3 slots
insert into venue_capacity (bu_id, day_of_week, time_slot, max_reservations, max_pax)
select bu.id, d.dow, s.slot, s.maxr, s.maxp
from business_units bu
cross join (values (4),(5),(6)) as d(dow)
cross join (values ('19:00–20:30',8,40), ('20:30–22:00',10,60), ('22:00–23:30',10,60)) as s(slot,maxr,maxp)
where bu.code in ('AJ','BM','PC')
on conflict (bu_id, day_of_week, time_slot) do nothing;

-- Guests de prueba (teléfonos +52 ficticios; consentimiento de términos sellado)
insert into guests (phone, full_name, email, origin_bu, tags, consent_terms, consent_terms_at, consent_marketing, consent_marketing_at, notes)
select * from (values
  ('+525511110001', 'María Fernanda Ríos',  'mafer@example.com',  (select id from business_units where code='AJ'), array['VIP'],                 true, now(), true,  now(), 'Mesa cerca de la barra'),
  ('+525511110002', 'Diego Carranza',        null,                 (select id from business_units where code='AJ'), array['Preferencia terraza'], true, now(), false, null,  null),
  ('+525511110003', 'Ana Sofía Trujillo',    'anasofia@example.com',(select id from business_units where code='BM'), array['Influencer'],          true, now(), true,  now(), null),
  ('+525511110004', 'Roberto Salas',         null,                 (select id from business_units where code='BM'), array['Corporativo'],         true, now(), false, null,  'Factura a nombre de su agencia'),
  ('+525511110005', 'Lucía Madrigal',        'lucia.m@example.com',(select id from business_units where code='PC'), array['VIP','Alergia'],       true, now(), true,  now(), 'Alergia a nueces'),
  ('+525511110006', 'Jorge Peña',            null,                 (select id from business_units where code='PC'), '{}'::text[],                 true, now(), false, null,  null),
  ('+525511110007', 'Camila Ortega',         'cami@example.com',   (select id from business_units where code='AJ'), '{}'::text[],                 true, now(), true,  now(), null),
  ('+525511110008', 'Esteban Quirarte',      null,                 (select id from business_units where code='BM'), '{}'::text[],                 true, now(), false, null,  null)
) as v(phone, full_name, email, origin_bu, tags, consent_terms, consent_terms_at, consent_marketing, consent_marketing_at, notes)
on conflict (phone) do nothing;

-- Reservas de prueba: HOY, en varios estados + un no-show histórico
insert into reservations (guest_id, bu_id, date, time_slot, party_size, zone, status, source, notes)
select * from (values
  ((select id from guests where phone='+525511110001'), (select id from business_units where code='AJ'), current_date, '19:00–20:30', 4,  'Terraza', 'confirmed', 'whatsapp',  'Cumpleaños — pastel propio'),
  ((select id from guests where phone='+525511110002'), (select id from business_units where code='AJ'), current_date, '19:00–20:30', 2,  'Barra',   'requested', 'instagram', null),
  ((select id from guests where phone='+525511110007'), (select id from business_units where code='AJ'), current_date, '20:30–22:00', 6,  'Salón',   'confirmed', 'phone',     null),
  ((select id from guests where phone='+525511110003'), (select id from business_units where code='BM'), current_date, '20:30–22:00', 8,  'VIP',     'confirmed', 'whatsapp',  'Trae fotógrafo'),
  ((select id from guests where phone='+525511110004'), (select id from business_units where code='BM'), current_date, '22:00–23:30', 12, 'Salón',   'requested', 'phone',     'Evento de agencia'),
  ((select id from guests where phone='+525511110005'), (select id from business_units where code='PC'), current_date, '19:00–20:30', 3,  'Terraza', 'seated',    'walk_in',   'Sin nueces en cocina'),
  ((select id from guests where phone='+525511110006'), (select id from business_units where code='PC'), current_date, '20:30–22:00', 2,  null,      'requested', 'phone',     null),
  ((select id from guests where phone='+525511110008'), (select id from business_units where code='BM'), current_date - 7, '22:00–23:30', 4, null,    'no_show',   'instagram', null)
) as v(guest_id, bu_id, date, time_slot, party_size, zone, status, source, notes)
where not exists (select 1 from reservations limit 1);

-- Historial de visitas de prueba (walk-ins pasados)
insert into guest_visits (guest_id, bu_id, visit_date, source)
select * from (values
  ((select id from guests where phone='+525511110001'), (select id from business_units where code='AJ'), current_date - 14, 'walk_in'),
  ((select id from guests where phone='+525511110001'), (select id from business_units where code='AJ'), current_date - 30, 'walk_in'),
  ((select id from guests where phone='+525511110005'), (select id from business_units where code='PC'), current_date - 10, 'walk_in'),
  ((select id from guests where phone='+525511110003'), (select id from business_units where code='BM'), current_date - 21, 'manual')
) as v(guest_id, bu_id, visit_date, source)
where not exists (select 1 from guest_visits limit 1);
