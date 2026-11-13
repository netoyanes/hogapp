-- ─────────────────────────────────────────────────────────────────────────────
-- Ronqueo · idioma de la compra + estadísticas del landing (embudo de venta)
--
-- Idioma: ronqueo_orders.idioma ('es' | 'en') — con él la edge function manda
-- el checkout de Stripe y el correo en el idioma en que compró la persona.
--
-- Embudo: el landing manda eventos anónimos (sin nombre, correo ni IP) a la
-- edge function ronqueo-tickets, que los guarda aquí:
--   visita        abrió /ronqueo (uno por carga de página)
--   boleto_visto  llegó a la tarjeta de compra
--   cta           clic en «compra tu boleto» (detalle = dónde: nav, hero,
--                 barra, cierre, menu)
--   pagar         clic en «pagar» con el formulario completo
-- «abrieron stripe» y «pagaron» salen de ronqueo_orders.
-- `visitante` es un id al azar guardado en el navegador: sirve para contar
-- personas distintas, no identifica a nadie.
--
-- HOG APP lo lee con ronqueo_embudo() (solo staff: fn_ronqueo_staff).
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.ronqueo_orders add column if not exists idioma text not null default 'es' check (idioma in ('es', 'en'));

create table if not exists public.ronqueo_eventos (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  tipo         text not null check (tipo in ('visita', 'boleto_visto', 'cta', 'pagar')),
  visitante    text not null check (length(visitante) between 8 and 64),
  idioma       text not null default 'es' check (idioma in ('es', 'en')),
  detalle      text check (length(detalle) <= 40),
  dispositivo  text check (dispositivo in ('movil', 'escritorio')),
  origen       text check (length(origen) <= 60)   -- ?ref= / utm_source del link
);
create index if not exists ronqueo_eventos_tipo_idx on public.ronqueo_eventos (tipo, created_at);
alter table public.ronqueo_eventos enable row level security;
drop policy if exists ronqueo_eventos_staff_sel on public.ronqueo_eventos;
create policy ronqueo_eventos_staff_sel on public.ronqueo_eventos for select to authenticated using (fn_ronqueo_staff());

-- Embudo completo para la vista de HOG APP
create or replace function public.ronqueo_embudo()
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not fn_ronqueo_staff() then raise exception 'sin permiso'; end if;
  select json_build_object(
    'visitas',          (select count(*) from ronqueo_eventos where tipo = 'visita'),
    'visitantes',       (select count(distinct visitante) from ronqueo_eventos where tipo = 'visita'),
    'boleto_visto',     (select count(distinct visitante) from ronqueo_eventos where tipo = 'boleto_visto'),
    'cta_clics',        (select count(*) from ronqueo_eventos where tipo = 'cta'),
    'cta_personas',     (select count(distinct visitante) from ronqueo_eventos where tipo = 'cta'),
    'pagar_clics',      (select count(*) from ronqueo_eventos where tipo = 'pagar'),
    'pagar_personas',   (select count(distinct visitante) from ronqueo_eventos where tipo = 'pagar'),
    'checkouts',        (select count(*) from ronqueo_orders where stripe_session_id is not null),
    'pagadas',          (select count(*) from ronqueo_orders where status = 'paid'),
    'lugares_pagados',  (select coalesce(sum(cantidad), 0) from ronqueo_orders where status = 'paid'),
    'cta_por_lugar',    (select coalesce(json_object_agg(d, n), '{}'::json) from (
                           select coalesce(detalle, 'otro') d, count(*) n from ronqueo_eventos where tipo = 'cta' group by 1) x),
    'visitas_por_idioma', (select coalesce(json_object_agg(idioma, n), '{}'::json) from (
                           select idioma, count(distinct visitante) n from ronqueo_eventos where tipo = 'visita' group by 1) x),
    'visitas_por_dispositivo', (select coalesce(json_object_agg(coalesce(dispositivo, 'otro'), n), '{}'::json) from (
                           select dispositivo, count(distinct visitante) n from ronqueo_eventos where tipo = 'visita' group by 1) x),
    'visitas_por_origen', (select coalesce(json_object_agg(o, n), '{}'::json) from (
                           select coalesce(origen, 'directo') o, count(distinct visitante) n from ronqueo_eventos where tipo = 'visita' group by 1 order by 2 desc limit 12) x),
    'por_dia',          (select coalesce(json_agg(d order by d.dia), '[]'::json) from (
                           select (created_at at time zone 'America/Mazatlan')::date dia,
                                  count(distinct visitante) filter (where tipo = 'visita') visitantes,
                                  count(*) filter (where tipo = 'cta') cta,
                                  count(*) filter (where tipo = 'pagar') pagar
                             from ronqueo_eventos group by 1) d)
  ) into r;
  return r;
end $$;
revoke all on function public.ronqueo_embudo() from public, anon;
grant execute on function public.ronqueo_embudo() to authenticated;
