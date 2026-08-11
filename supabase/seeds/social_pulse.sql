-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · PULSO SOCIAL — métricas de redes por venue
--  · social_accounts:  cuentas conectadas (IG / Facebook / Google Maps) por venue
--  · social_snapshots: foto diaria de métricas (seguidores, reach, engagement,
--                      rating, DMs y ventas por DM)
--  · social_mentions:  comentarios/reseñas/DMs con análisis de sentimiento,
--                      emoción e intención de compra (edge function social-pulse)
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.social_accounts (
  id           uuid primary key default gen_random_uuid(),
  bu_id        uuid not null references business_units(id) on delete cascade,
  platform     text not null check (platform in ('instagram', 'facebook', 'google')),
  handle       text,
  external_id  text not null,  -- IG business user id · FB page id · Google place_id
  access_token text,           -- opcional: si es null usa el secret global (IG_PAGE_ACCESS_TOKEN / GOOGLE_MAPS_API_KEY)
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (bu_id, platform)
);

alter table social_accounts enable row level security;
drop policy if exists saccounts_select on social_accounts;
create policy saccounts_select on social_accounts for select using (auth.role() = 'authenticated');
drop policy if exists saccounts_write on social_accounts;
create policy saccounts_write on social_accounts for all to authenticated
  using (hog_role() in ('MASTER', 'C_LEVEL'))
  with check (hog_role() in ('MASTER', 'C_LEVEL'));

create table if not exists public.social_snapshots (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references social_accounts(id) on delete cascade,
  taken_on      date not null default current_date,
  followers     int,
  following     int,
  posts         int,
  reach         int,        -- alcance últimos 28 días (IG insights)
  profile_views int,
  engagement    numeric,    -- (likes+comentarios promedio por post) / seguidores, en %
  rating        numeric,    -- Google Maps / Facebook
  reviews_count int,
  dm_in         int,        -- mensajes entrantes del día (bot)
  dm_out        int,
  dm_sales      int,        -- reservas creadas vía DM/bot ese día
  created_at    timestamptz not null default now(),
  unique (account_id, taken_on)
);
create index if not exists idx_social_snapshots_acct on social_snapshots (account_id, taken_on desc);

alter table social_snapshots enable row level security;
drop policy if exists ssnapshots_select on social_snapshots;
create policy ssnapshots_select on social_snapshots for select using (auth.role() = 'authenticated');
-- escrituras: solo la edge function (service role, brinca RLS)

create table if not exists public.social_mentions (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references social_accounts(id) on delete cascade,
  kind         text not null check (kind in ('comment', 'review', 'dm')),
  external_id  text not null,
  author       text,
  text         text not null,
  posted_at    timestamptz,
  rating       int,             -- reseñas (1-5)
  sentiment    numeric,         -- -1 (muy negativo) … 1 (muy positivo)
  emotion      text,            -- alegría · entusiasmo · neutral · duda · decepción · enojo
  sales_intent boolean not null default false,  -- pregunta por precio/reserva/compra
  analyzed_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (account_id, kind, external_id)
);
create index if not exists idx_social_mentions_acct on social_mentions (account_id, posted_at desc);
create index if not exists idx_social_mentions_pending on social_mentions (analyzed_at) where analyzed_at is null;

alter table social_mentions enable row level security;
drop policy if exists smentions_select on social_mentions;
create policy smentions_select on social_mentions for select using (auth.role() = 'authenticated');

-- ── Cron diario (opcional, cuando la edge function esté desplegada) ──────────
-- Igual que reservations-cron: pg_cron + pg_net. Sustituye SERVICE_ROLE_KEY.
-- select cron.schedule(
--   'social-pulse-daily', '0 13 * * *',  -- 13:00 UTC = 6-7am Mazatlán
--   $$ select net.http_post(
--        url := 'https://ksxgxdewrwoslpnvvqnm.supabase.co/functions/v1/social-pulse',
--        headers := '{"Content-Type":"application/json","Authorization":"Bearer SERVICE_ROLE_KEY"}'::jsonb,
--        body := '{"action":"run"}'::jsonb
--      ) $$
-- );
