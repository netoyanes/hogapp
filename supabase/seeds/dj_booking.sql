-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Talento — booking interno de DJs por venue
-- ⚠ PARCIALMENTE SUPERSEDIDO: la tabla `djs` se unificó en crm_contacts
--   (contact_type='DJ') — ver unify_dj_directory.sql. NO re-ejecutar este
--   archivo después de la unificación (recrearía la tabla djs vacía).
--   dj_bookings sigue vigente, con FK a crm_contacts.
-- Base de DJs con fee registrado + agenda de tocadas. El Concierge la usa en
-- dos direcciones: vende la programación a clientes y recluta DJs que
-- escriben por DM (source='concierge').
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Directorio de talento ───────────────────────────────────────────────────
create table if not exists public.djs (
  id          uuid primary key default gen_random_uuid(),
  stage_name  text not null,                        -- nombre artístico
  real_name   text,
  phone       text,
  email       text,
  instagram   text,                                 -- @handle
  city        text,
  genres      text[] not null default '{}',
  base_fee    numeric,                              -- MXN por tocada (referencia)
  fee_notes   text,                                 -- "negociable entre semana", "USD", etc.
  rider       text,                                 -- peticiones típicas (equipo, hospitalidad)
  links       text,                                 -- soundcloud / mixes / press kit
  rating      int check (rating between 1 and 5),   -- interno, nunca se comparte
  status      text not null default 'active' check (status in ('active','vetoed')),
  source      text not null default 'manual' check (source in ('manual','concierge')),
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists idx_djs_phone on djs (phone) where phone is not null;

drop trigger if exists trg_djs_touch on djs;
create trigger trg_djs_touch before update on djs
  for each row execute function touch_updated_at();

-- ─── Tocadas (bookings) ──────────────────────────────────────────────────────
create table if not exists public.dj_bookings (
  id               uuid primary key default gen_random_uuid(),
  dj_id            uuid not null references djs(id) on delete cascade,
  bu_id            uuid not null references business_units(id) on delete cascade,
  date             date not null,
  start_time       text not null default '22:00',   -- HH:MM; fin abierto (horarios libres)
  end_time         text,
  fee              numeric not null default 0,       -- fee negociado de ESA tocada (MXN)
  paid             boolean not null default false,
  special_requests text,                             -- rider de la fecha: equipo, hospedaje, botella…
  status           text not null default 'confirmed'
                   check (status in ('tentative','confirmed','played','cancelled','no_show')),
  notes            text,
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_djbook_board on dj_bookings (bu_id, date);
create index if not exists idx_djbook_dj on dj_bookings (dj_id, date);

drop trigger if exists trg_djbook_touch on dj_bookings;
create trigger trg_djbook_touch before update on dj_bookings
  for each row execute function touch_updated_at();

-- ─── RLS: fees son dato sensible — solo Ops/Master (y C-Level lectura).
--         El bot escribe con service role (registrar_dj / programación). ─────
alter table djs enable row level security;
alter table dj_bookings enable row level security;

drop policy if exists djs_select on djs;
create policy djs_select on djs for select to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER'));
drop policy if exists djs_write on djs;
create policy djs_write on djs for all to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER'))
  with check (hog_role() in ('MASTER','OPS_MANAGER'));

drop policy if exists djbook_select on dj_bookings;
create policy djbook_select on dj_bookings for select to authenticated
  using (hog_role() in ('MASTER','C_LEVEL') or (hog_role() = 'OPS_MANAGER' and hog_has_venue(bu_id)));
drop policy if exists djbook_write on dj_bookings;
create policy djbook_write on dj_bookings for all to authenticated
  using (hog_role() = 'MASTER' or (hog_role() = 'OPS_MANAGER' and hog_has_venue(bu_id)))
  with check (hog_role() = 'MASTER' or (hog_role() = 'OPS_MANAGER' and hog_has_venue(bu_id)));
