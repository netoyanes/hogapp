-- ════════════════════════════════════════════════════════════════════════════
-- Doña Concha · Reporte de ventas compartible
--
-- Desde HOG APP (MASTER o C_LEVEL) se genera un link único que vence, con el
-- periodo que se elija. Quien tenga el link ve el reporte (sin cuenta) hasta que
-- vence o se revoca; puede descargarlo en PDF.
--
-- El reporte junta las ventas del POS (concha_ordenes) con el historial
-- anterior al POS (concha_historial_dia / concha_historial_platillo). Si un día
-- tiene ventas en el POS, manda el POS; si no, el historial.
--
-- Requiere concha_pos.sql. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_concha_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select hog_role() in ('MASTER', 'C_LEVEL')
$$;
revoke all on function public.fn_concha_admin() from public, anon;
grant execute on function public.fn_concha_admin() to authenticated;

-- ── Historial (ventas antes del POS) ───────────────────────────────────────
create table if not exists public.concha_historial_dia (
  fecha       date primary key,
  venta       int not null default 0,          -- centavos
  comidas     int not null default 0,
  ordenes     int,
  efectivo    int,
  tarjeta     int,
  propinas    int,
  sin_cobro   int,                             -- centavos a precio de lista
  notas       text,
  fuente      text not null default 'historial',
  cargado_en  timestamptz not null default now()
);

create table if not exists public.concha_historial_platillo (
  fecha     date not null,
  platillo  text not null,
  cantidad  int not null,
  monto     int,
  primary key (fecha, platillo)
);

-- ── Links compartidos ──────────────────────────────────────────────────────
create table if not exists public.concha_reportes (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique,             -- 64 caracteres al azar
  titulo        text not null,
  desde         date not null,
  hasta         date not null check (hasta >= desde),
  expira_en     timestamptz not null,
  revocado      boolean not null default false,
  creado_por    uuid references auth.users(id),
  creado_en     timestamptz not null default now(),
  vistas        int not null default 0,
  ultima_vista  timestamptz
);

alter table public.concha_historial_dia enable row level security;
alter table public.concha_historial_platillo enable row level security;
alter table public.concha_reportes enable row level security;

drop policy if exists concha_historial_dia_sel on public.concha_historial_dia;
create policy concha_historial_dia_sel on public.concha_historial_dia for select to authenticated using (fn_concha_staff());
drop policy if exists concha_historial_dia_adm on public.concha_historial_dia;
create policy concha_historial_dia_adm on public.concha_historial_dia for all to authenticated using (fn_concha_admin()) with check (fn_concha_admin());
drop policy if exists concha_historial_platillo_sel on public.concha_historial_platillo;
create policy concha_historial_platillo_sel on public.concha_historial_platillo for select to authenticated using (fn_concha_staff());
drop policy if exists concha_historial_platillo_adm on public.concha_historial_platillo;
create policy concha_historial_platillo_adm on public.concha_historial_platillo for all to authenticated using (fn_concha_admin()) with check (fn_concha_admin());
drop policy if exists concha_reportes_adm on public.concha_reportes;
create policy concha_reportes_adm on public.concha_reportes for all to authenticated using (fn_concha_admin()) with check (fn_concha_admin());

-- ── Datos del reporte (uso interno: solo lo llaman las funciones de abajo) ──
create or replace function public.concha_datos_reporte(p_desde date, p_hasta date)
returns jsonb language sql stable security definer set search_path = public as $$
with o as (
  select * from concha_ordenes where estado = 'cobrada' and fecha between p_desde and p_hasta
),
r as (
  select r.*, o.fecha, o.sin_cobro from concha_orden_renglones r join o on o.id = r.orden_id
),
pg as (
  select p.*, o.fecha from concha_pagos p join o on o.id = p.orden_id where not o.sin_cobro
),
pos_dia as (
  select fecha,
         count(*) filter (where not sin_cobro)              as ordenes,
         coalesce(sum(total) filter (where not sin_cobro), 0) as venta,
         count(*) filter (where sin_cobro)                  as ordenes_sin_cobro,
         coalesce(sum(costo_sin_cobro), 0)                  as costo_sin_cobro
  from o group by fecha
),
com_dia as (
  select fecha, coalesce(sum(cantidad) filter (where tipo = 'comida' and not sin_cobro), 0) as comidas from r group by fecha
),
pag_dia as (
  select fecha,
         coalesce(sum(monto) filter (where forma = 'efectivo'), 0) as efectivo,
         coalesce(sum(monto) filter (where forma = 'tarjeta'), 0)  as tarjeta,
         coalesce(sum(propina), 0)                                as propinas
  from pg group by fecha
),
serie as (
  select d.fecha,
         case when pd.fecha is not null then 'pos' when h.fecha is not null then 'historial' end as fuente,
         case when pd.fecha is not null then pd.venta else coalesce(h.venta, 0) end                    as venta,
         case when pd.fecha is not null then coalesce(cd.comidas, 0) else coalesce(h.comidas, 0) end   as comidas,
         case when pd.fecha is not null then pd.ordenes else coalesce(h.ordenes, 0) end                as ordenes,
         case when pd.fecha is not null then coalesce(pa.efectivo, 0) else coalesce(h.efectivo, 0) end as efectivo,
         case when pd.fecha is not null then coalesce(pa.tarjeta, 0) else coalesce(h.tarjeta, 0) end   as tarjeta,
         case when pd.fecha is not null then coalesce(pa.propinas, 0) else coalesce(h.propinas, 0) end as propinas,
         coalesce(pd.ordenes_sin_cobro, 0)                                                              as ordenes_sin_cobro,
         case when pd.fecha is not null then pd.costo_sin_cobro else coalesce(h.sin_cobro, 0) end      as costo_sin_cobro
  from (select g::date as fecha from generate_series(p_desde, p_hasta, interval '1 day') g) d
  left join pos_dia pd on pd.fecha = d.fecha
  left join com_dia cd on cd.fecha = d.fecha
  left join pag_dia pa on pa.fecha = d.fecha
  left join concha_historial_dia h on h.fecha = d.fecha
),
platillos as (
  select nombre, sum(cantidad)::int as cantidad, sum(monto)::int as monto from (
    select r.nombre, r.cantidad, r.precio_unit * r.cantidad as monto from r where not r.sin_cobro
    union all
    select hp.platillo, hp.cantidad, coalesce(hp.monto, 0) from concha_historial_platillo hp
    where hp.fecha between p_desde and p_hasta and not exists (select 1 from pos_dia where pos_dia.fecha = hp.fecha)
  ) x group by nombre
)
select jsonb_build_object(
  'meta', (select meta_diaria from concha_config where id = 1),
  'dias', coalesce((select jsonb_agg(to_jsonb(s) order by s.fecha) from serie s), '[]'::jsonb),
  'platillos', coalesce((select jsonb_agg(to_jsonb(p) order by p.cantidad desc, p.nombre) from platillos p), '[]'::jsonb),
  'descuentos', coalesce((select jsonb_agg(x order by x->>'nombre') from (
      select jsonb_build_object('nombre', descuento_nombre, 'tipo', descuento_tipo, 'ordenes', count(*), 'monto', sum(descuento_monto)) x
      from o where descuento_id is not null and not sin_cobro group by descuento_nombre, descuento_tipo) t), '[]'::jsonb),
  'sin_cobro', coalesce((select jsonb_agg(x order by x->>'motivo') from (
      select jsonb_build_object('motivo', coalesce(o.descuento_nombre, 'Sin motivo'), 'ordenes', count(*),
             'comidas', coalesce(sum((select sum(cantidad) from concha_orden_renglones rr where rr.orden_id = o.id and rr.tipo = 'comida')), 0),
             'costo', sum(o.costo_sin_cobro)) x
      from o where o.sin_cobro group by o.descuento_nombre) t), '[]'::jsonb),
  'colaboraciones', coalesce((select jsonb_agg(jsonb_build_object('chef', chef, 'vendidos', vendidos, 'ganancia', ganancia, 'al_chef', al_chef)) from (
      select chef, sum(vendidos)::int vendidos, sum(ganancia)::int ganancia, sum(al_chef)::int al_chef
      from concha_v_reparto_colaboracion where fecha between p_desde and p_hasta group by chef) t), '[]'::jsonb),
  'servicio', coalesce((select jsonb_object_agg(servicio, n) from (select servicio, count(*) n from o where not sin_cobro group by servicio) t), '{}'::jsonb),
  'cajeros', coalesce((select jsonb_agg(jsonb_build_object('cajero', cajero, 'ordenes', ordenes, 'venta', venta) order by venta desc) from (
      select coalesce(cajero_usuario, '—') cajero, count(*) ordenes, sum(total) venta from o where not sin_cobro group by 1) t), '[]'::jsonb),
  'horas', coalesce((select jsonb_agg(jsonb_build_object('hora', hora, 'ordenes', n) order by hora) from (
      select extract(hour from cobrada_en at time zone 'America/Mazatlan')::int hora, count(*) n
      from o where not sin_cobro and cobrada_en is not null group by 1) t), '[]'::jsonb)
)
$$;
revoke all on function public.concha_datos_reporte(date, date) from public, anon, authenticated;

-- ── Crear un link (MASTER o C_LEVEL) ───────────────────────────────────────
create or replace function public.concha_crear_reporte(p_desde date, p_hasta date, p_horas int, p_titulo text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r concha_reportes;
begin
  if not fn_concha_admin() then raise exception 'Solo MASTER o C_LEVEL pueden compartir reportes'; end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'Periodo inválido'; end if;
  if p_hasta - p_desde > 730 then raise exception 'El periodo máximo es de dos años'; end if;
  if p_horas is null or p_horas < 1 or p_horas > 24 * 90 then raise exception 'La vigencia debe ser de 1 hora a 90 días'; end if;
  insert into concha_reportes (token, titulo, desde, hasta, expira_en, creado_por)
  values (encode(gen_random_bytes(32), 'hex'), coalesce(nullif(trim(p_titulo), ''), 'Reporte de ventas · Doña Concha'),
          p_desde, p_hasta, now() + make_interval(hours => p_horas), auth.uid())
  returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.concha_crear_reporte(date, date, int, text) from public, anon;
grant execute on function public.concha_crear_reporte(date, date, int, text) to authenticated;

-- ── Vista previa dentro de HOG APP (MASTER o C_LEVEL) ──────────────────────
create or replace function public.concha_reporte_vista_previa(p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_concha_admin() then raise exception 'Sin acceso'; end if;
  return concha_datos_reporte(p_desde, p_hasta);
end $$;
revoke all on function public.concha_reporte_vista_previa(date, date) from public, anon;
grant execute on function public.concha_reporte_vista_previa(date, date) to authenticated;

-- ── Abrir un link (cualquiera con el link, sin cuenta) ─────────────────────
create or replace function public.concha_reporte_publico(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r concha_reportes;
begin
  if p_token is null or length(p_token) <> 64 then return jsonb_build_object('estado', 'no_existe'); end if;
  select * into r from concha_reportes where token = p_token;
  if not found then return jsonb_build_object('estado', 'no_existe'); end if;
  if r.revocado then return jsonb_build_object('estado', 'revocado'); end if;
  if r.expira_en < now() then return jsonb_build_object('estado', 'vencido', 'expira_en', r.expira_en); end if;
  update concha_reportes set vistas = vistas + 1, ultima_vista = now() where id = r.id;
  return jsonb_build_object('estado', 'ok', 'titulo', r.titulo, 'desde', r.desde, 'hasta', r.hasta,
    'expira_en', r.expira_en, 'generado', now(), 'datos', concha_datos_reporte(r.desde, r.hasta));
end $$;
revoke all on function public.concha_reporte_publico(text) from public;
grant execute on function public.concha_reporte_publico(text) to anon, authenticated;
