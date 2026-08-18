-- ─────────────────────────────────────────────────────────────────────────────
-- TRACKER DEL LANDING DE RESERVAS (?reservar=CODE) — cuántas personas ven el
-- link público de cada venue, y cuántas de esas terminan reservando.
--
--   · landing_views: una fila por vista. El navegador manda un session_id
--     persistente (localStorage), así "visitantes" = personas distintas y
--     "vistas" = aperturas totales; el refresh en la misma pestaña no duplica
--     (lo filtra el cliente con sessionStorage).
--   · El insert SOLO entra por fn_track_landing_view (security definer,
--     ejecutable por anon) — la tabla no tiene policy de insert directa.
--   · fn_landing_stats agrega por venue y cruza contra las reservas con
--     source='web' (las que nacen del propio landing) → conversión real.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.landing_views (
  id         uuid primary key default gen_random_uuid(),
  bu_id      uuid not null references business_units(id) on delete cascade,
  code       text not null,
  session_id text,                 -- visitante (uuid persistente del navegador)
  device     text,                 -- mobile | desktop
  referrer   text,                 -- de dónde llegó (IG, Google, directo…)
  viewed_at  timestamptz not null default now()
);
-- GEO (v2): país/región/ciudad del visitante. Lo llena la edge function
-- og-share con los headers x-vercel-ip-* que Vercel calcula al proxear /r/CODE
-- — gratis, sin servicios externos y sin tocar la privacidad más allá de la
-- ciudad. Los links viejos (?reservar= directo) no traen geo: por eso las
-- pautas y compartidos deben usar SIEMPRE /r/CODE.
alter table landing_views add column if not exists country text;
alter table landing_views add column if not exists region  text;
alter table landing_views add column if not exists city    text;
alter table landing_views add column if not exists via     text;   -- 'link' = entró por /r/

create index if not exists idx_lviews_bu   on landing_views (bu_id, viewed_at desc);
create index if not exists idx_lviews_time on landing_views (viewed_at desc);

alter table landing_views enable row level security;
drop policy if exists lviews_select on landing_views;
create policy lviews_select on landing_views for select to authenticated using (true);
-- (sin policy de insert: solo escribe la función)

-- Registra una vista del landing. Valida que el código exista — el resto de
-- parámetros se recortan para que nadie infle la tabla con basura larga.
create or replace function public.fn_track_landing_view(
  p_code text, p_session text default null, p_device text default null, p_referrer text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid;
begin
  select id into v_bu from business_units where code = upper(btrim(coalesce(p_code, '')));
  if v_bu is null then return; end if;  -- código inventado: no se guarda nada
  insert into landing_views (bu_id, code, session_id, device, referrer)
  values (v_bu, upper(btrim(p_code)), left(p_session, 64),
          case when p_device in ('mobile','desktop') then p_device else null end,
          left(p_referrer, 300));
end
$$;

revoke all on function public.fn_track_landing_view(text, text, text, text) from public;
grant execute on function public.fn_track_landing_view(text, text, text, text) to anon, authenticated;

-- Embudo por venue en un periodo: vistas, visitantes distintos, reservas que
-- nacieron del landing (source='web') y las confirmadas/sentadas/completadas.
create or replace function public.fn_landing_stats(p_desde timestamptz)
returns table(bu_code text, bu_name text, vistas bigint, visitantes bigint, reservas bigint, reservas_ok bigint)
language sql
security definer
set search_path = public
as $$
  select b.code, b.name,
         count(v.id),
         count(distinct coalesce(v.session_id, v.id::text)),
         (select count(*) from reservations r
           where r.bu_id = b.id and r.source = 'web' and r.created_at >= p_desde),
         (select count(*) from reservations r
           where r.bu_id = b.id and r.source = 'web' and r.created_at >= p_desde
             and r.status in ('confirmed','seated','completed'))
  from business_units b
  join landing_views v on v.bu_id = b.id and v.viewed_at >= p_desde
  group by b.id, b.code, b.name
  order by count(v.id) desc
$$;

revoke all on function public.fn_landing_stats(timestamptz) from public;
grant execute on function public.fn_landing_stats(timestamptz) to authenticated;

-- De dónde nos ven: top ciudades del periodo (para el Resumen del Concierge)
create or replace function public.fn_landing_geo(p_desde timestamptz)
returns table(country text, region text, city text, vistas bigint)
language sql security definer set search_path = public as $$
  select v.country, v.region, v.city, count(*)
  from landing_views v
  where v.viewed_at >= p_desde and v.country is not null
  group by v.country, v.region, v.city
  order by count(*) desc
  limit 12
$$;
revoke all on function public.fn_landing_geo(timestamptz) from public;
grant execute on function public.fn_landing_geo(timestamptz) to authenticated;

-- ── BANDEJA: marca de VISUALIZADO (para el cierre en bulk) ───────────────────
-- Se llena al abrir el hilo; una conversación cuenta como visualizada solo si
-- se abrió DESPUÉS de su último mensaje — si el cliente escribió de nuevo,
-- vuelve a ser "no vista" y no se puede cerrar en bulk sin abrirla.
alter table bot_conversations add column if not exists viewed_at timestamptz;

notify pgrst, 'reload schema';
