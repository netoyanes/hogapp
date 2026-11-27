-- ════════════════════════════════════════════════════════════════════════════
-- Doña Concha · Punto de venta (/concha)
--
-- La tablet de caja trabaja SIN INTERNET: guarda todo localmente y sube cada
-- orden cobrada con concha_subir_orden() cuando hay red. La subida es
-- idempotente (el id lo genera la tablet), así que reintentar no duplica.
-- El folio lo asigna la tablet: consecutivo por día y por dispositivo.
--
-- Dinero en centavos (int). Fechas de trabajo en hora de Mazatlán.
-- Acceso: MASTER, C_LEVEL, DEV o quien tenga asignada la app 'concha'.
-- Idempotente: se puede volver a correr.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_concha_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select hog_role() in ('MASTER', 'C_LEVEL', 'DEV')
      or exists (select 1 from user_apps where user_id = auth.uid() and app = 'concha')
$$;
revoke all on function public.fn_concha_staff() from public, anon;
grant execute on function public.fn_concha_staff() to authenticated;

-- ── Configuración ──────────────────────────────────────────────────────────
create table if not exists public.concha_config (
  id                    int primary key default 1 check (id = 1),
  meta_diaria           int not null default 40,
  sellos_para_gratis    int not null default 10,
  fondo_caja_sugerido   int not null default 0,
  servicio_aqui         boolean not null default true,
  servicio_llevar       boolean not null default true,
  servicio_domicilio    boolean not null default false,   -- listo para activarse
  precios_incluyen_iva  boolean,                          -- pendiente del negocio
  actualizado_en        timestamptz not null default now()
);

create table if not exists public.concha_turnos (
  id          text primary key,                 -- 'comida', 'brunch', 'desayuno'
  nombre      text not null,
  dias        int[] not null,                   -- 0 = domingo … 6 = sábado
  inicio      time not null,
  fin         time not null,
  precio_base int not null default 0,
  suma_sello  boolean,                          -- null = pendiente (no suma)
  activo      boolean not null default true
);

create table if not exists public.concha_platillos (
  id                  text primary key,
  nombre              text not null,
  tipo                text not null check (tipo in ('guiso', 'guarnicion', 'agua', 'extra')),
  precio              int,                      -- null: guiso usa precio del turno; extra = pendiente
  costo_ingredientes  int,
  activo              boolean not null default true,
  creado_en           timestamptz not null default now()
);

-- Vigencia: mover un platillo = cambiar fechas; copiar = otro registro
create table if not exists public.concha_menu (
  id           text primary key,
  platillo_id  text not null references public.concha_platillos(id),
  turno_id     text not null references public.concha_turnos(id),
  vigencia     text not null check (vigencia in ('semana', 'dia', 'rango')),
  desde        date not null,
  hasta        date not null check (hasta >= desde),
  porciones    int,                             -- por día; null = sin límite
  orden        int not null default 0
);
create index if not exists concha_menu_fechas_idx on public.concha_menu (desde, hasta);

-- Solo el "agotado a mano"; las vendidas salen de los renglones
create table if not exists public.concha_existencias (
  fecha           date not null,
  platillo_id     text not null references public.concha_platillos(id),
  agotado_manual  boolean not null default false,
  primary key (fecha, platillo_id)
);

create table if not exists public.concha_colaboraciones (
  id                  text primary key,
  chef                text not null,
  platillo_id         text not null references public.concha_platillos(id),
  desde               date not null,
  hasta               date not null check (hasta >= desde),
  precio              int not null,
  costo_ingredientes  int not null,
  reparto_pct         numeric not null default 50,
  dias_con_reparto    int not null default 7,
  tope_dia            int,
  topes               jsonb not null default '{}'::jsonb,   -- { "2026-11-23": 30 }
  activo              boolean not null default true
);

create table if not exists public.concha_descuentos (
  id                     text primary key,
  nombre                 text not null,
  etiqueta               text not null,
  tipo                   text not null check (tipo in ('convenio', 'codigo', 'cliente_frecuente', 'sin_cobro')),
  codigo                 text,
  porcentaje             numeric not null,
  motivo                 text,
  requiere_credencial    boolean not null default false,
  desde                  date,
  hasta                  date,
  aplica_a_colaboracion  boolean,             -- pendiente del negocio
  activo                 boolean not null default true
);

-- ── Ventas ─────────────────────────────────────────────────────────────────
create table if not exists public.concha_ordenes (
  id                  uuid primary key,                 -- lo genera la tablet
  dispositivo         uuid not null,
  fecha               date not null,
  folio               int not null,
  creada_en           timestamptz not null,
  cobrada_en          timestamptz,
  turno_id            text,
  servicio            text not null check (servicio in ('aqui', 'llevar', 'domicilio')),
  canal               text not null default 'mostrador' check (canal in ('mostrador', 'telefono')),
  nombre_cliente      text,
  telefono            text,
  direccion           text,
  costo_envio         int not null default 0,
  estado              text not null check (estado in ('abierta', 'cobrada', 'cancelada')),
  descuento_id        text,
  descuento_nombre    text,
  descuento_tipo      text,
  descuento_pct       numeric,
  descuento_motivo    text,
  codigo_capturado    text,
  subtotal            int not null,
  descuento_monto     int not null default 0,
  total               int not null,
  sin_cobro           boolean not null default false,
  costo_sin_cobro     int not null default 0,
  sellos              int not null default 0,
  sello_numero        int,
  cajero              uuid references auth.users(id),
  subida_en           timestamptz not null default now(),
  unique (fecha, dispositivo, folio)
);
create index if not exists concha_ordenes_fecha_idx on public.concha_ordenes (fecha);

create table if not exists public.concha_orden_renglones (
  id               uuid primary key,
  orden_id         uuid not null references public.concha_ordenes(id) on delete cascade,
  tipo             text not null check (tipo in ('comida', 'extra')),
  platillo_id      text not null,
  nombre           text not null,
  guarnicion1_id   text,
  guarnicion1      text,
  guarnicion2_id   text,
  guarnicion2      text,
  agua_id          text,                   -- null = sin agua
  agua             text,
  cantidad         int not null check (cantidad > 0),
  precio_unit      int not null,
  costo_unit       int,
  colaboracion_id  text
);
create index if not exists concha_renglones_orden_idx on public.concha_orden_renglones (orden_id);

create table if not exists public.concha_pagos (
  id          uuid primary key,
  orden_id    uuid not null references public.concha_ordenes(id) on delete cascade,
  forma       text not null check (forma in ('efectivo', 'tarjeta')),
  monto       int not null,
  recibido    int,
  cambio      int,
  propina     int not null default 0,      -- con tarjeta, aparte de la venta
  referencia  text
);
create index if not exists concha_pagos_orden_idx on public.concha_pagos (orden_id);

create table if not exists public.concha_gastos_caja (
  id              uuid primary key,
  fecha           date not null,
  concepto        text not null,
  monto           int not null,
  registrado_por  uuid references auth.users(id),
  creado_en       timestamptz not null default now()
);

create table if not exists public.concha_cortes (
  id                   uuid primary key,
  fecha                date not null unique,
  fondo                int not null,
  venta_total          int not null,
  efectivo             int not null,
  tarjeta              int not null,
  propinas             int not null,
  gastos               int not null,
  sin_cobro_costo      int not null,
  efectivo_a_entregar  int not null,
  efectivo_contado     int,
  diferencia           int,
  desglose             jsonb not null default '{}'::jsonb,   -- copia fija: por guiso, convenio, sin cobro, colaboración
  notas                text,
  cerrado_por          uuid references auth.users(id),
  cerrado_en           timestamptz not null default now()
);

-- ── Permisos ───────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['concha_config','concha_turnos','concha_platillos','concha_menu','concha_existencias',
    'concha_colaboraciones','concha_descuentos','concha_ordenes','concha_orden_renglones','concha_pagos',
    'concha_gastos_caja','concha_cortes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff', t);
    execute format('create policy %I on public.%I for all to authenticated using (fn_concha_staff()) with check (fn_concha_staff())', t || '_staff', t);
  end loop;
end $$;

-- ── Subida de una orden desde la tablet (idempotente) ──────────────────────
-- Recibe la orden tal como la guarda la tablet (camelCase, ver src/concha/types.ts).
create or replace function public.concha_subir_orden(o jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare oid uuid := (o->>'id')::uuid; r jsonb; p jsonb;
begin
  if not fn_concha_staff() then raise exception 'sin acceso al POS de Doña Concha'; end if;
  if exists (select 1 from concha_ordenes where id = oid) then return oid; end if;  -- ya se subió

  insert into concha_ordenes (id, dispositivo, fecha, folio, creada_en, cobrada_en, turno_id, servicio, canal,
    nombre_cliente, telefono, direccion, costo_envio, estado, descuento_id, descuento_nombre, descuento_tipo,
    descuento_pct, descuento_motivo, codigo_capturado, subtotal, descuento_monto, total, sin_cobro,
    costo_sin_cobro, sellos, sello_numero, cajero)
  values (oid, (o->>'dispositivo')::uuid, (o->>'fecha')::date, (o->>'folio')::int, (o->>'creadaEn')::timestamptz,
    (o->>'cobradaEn')::timestamptz, o->>'turnoId', o->>'servicio', coalesce(o->>'canal', 'mostrador'),
    o->>'nombreCliente', o->>'telefono', o->>'direccion', coalesce((o->>'costoEnvio')::int, 0), o->>'estado',
    o->'descuento'->>'id', o->'descuento'->>'nombre', o->'descuento'->>'tipo', (o->'descuento'->>'porcentaje')::numeric,
    o->'descuento'->>'motivo', o->>'codigoCapturado', (o->>'subtotal')::int, (o->>'descuentoMonto')::int,
    (o->>'total')::int, (o->>'sinCobro')::boolean, (o->>'costoSinCobro')::int, (o->>'sellos')::int,
    (o->>'selloNumero')::int, auth.uid());

  for r in select * from jsonb_array_elements(o->'renglones') loop
    insert into concha_orden_renglones (id, orden_id, tipo, platillo_id, nombre, guarnicion1_id, guarnicion1,
      guarnicion2_id, guarnicion2, agua_id, agua, cantidad, precio_unit, costo_unit, colaboracion_id)
    values ((r->>'id')::uuid, oid, r->>'tipo', r->>'platilloId', r->>'nombre',
      r->'guarniciones'->0->>'id', r->'guarniciones'->0->>'nombre',
      r->'guarniciones'->1->>'id', r->'guarniciones'->1->>'nombre',
      r->'agua'->>'id', r->'agua'->>'nombre', (r->>'cantidad')::int, (r->>'precioUnit')::int,
      (r->>'costoUnit')::int, r->>'colaboracionId');
  end loop;

  for p in select * from jsonb_array_elements(o->'pagos') loop
    insert into concha_pagos (id, orden_id, forma, monto, recibido, cambio, propina, referencia)
    values ((p->>'id')::uuid, oid, p->>'forma', (p->>'monto')::int, (p->>'recibido')::int,
      (p->>'cambio')::int, coalesce((p->>'propina')::int, 0), p->>'referencia');
  end loop;
  return oid;
end $$;
revoke all on function public.concha_subir_orden(jsonb) from public, anon;
grant execute on function public.concha_subir_orden(jsonb) to authenticated;

-- ── Vistas para los dashboards de HOG APP ──────────────────────────────────
-- Ventas por día contra la meta y ticket promedio (sin cobro va aparte)
create or replace view public.concha_v_ventas_dia with (security_invoker = true) as
select o.fecha,
       count(*) filter (where not o.sin_cobro)                                as ordenes,
       coalesce(sum(r.comidas) filter (where not o.sin_cobro), 0)              as comidas_vendidas,
       coalesce(sum(o.total) filter (where not o.sin_cobro), 0)                as venta,
       round(avg(o.total) filter (where not o.sin_cobro))                      as ticket_promedio,
       count(*) filter (where o.sin_cobro)                                     as ordenes_sin_cobro,
       coalesce(sum(o.costo_sin_cobro), 0)                                     as costo_sin_cobro,
       (select meta_diaria from concha_config where id = 1)                    as meta
from concha_ordenes o
left join lateral (select sum(cantidad) filter (where tipo = 'comida') as comidas
                   from concha_orden_renglones where orden_id = o.id) r on true
where o.estado = 'cobrada'
group by o.fecha;

-- Reparto con el chef: vendidos por día y lo que le toca (primera semana)
create or replace view public.concha_v_reparto_colaboracion with (security_invoker = true) as
select c.id as colaboracion_id, c.chef, o.fecha,
       sum(r.cantidad)                                                     as vendidos,
       sum((r.precio_unit - coalesce(r.costo_unit, 0)) * r.cantidad)       as ganancia,
       case when o.fecha < c.desde + c.dias_con_reparto
            then round(sum((r.precio_unit - coalesce(r.costo_unit, 0)) * r.cantidad) * c.reparto_pct / 100)
            else 0 end                                                     as al_chef
from concha_colaboraciones c
join concha_orden_renglones r on r.colaboracion_id = c.id
join concha_ordenes o on o.id = r.orden_id and o.estado = 'cobrada' and not o.sin_cobro
group by c.id, c.chef, c.desde, c.dias_con_reparto, c.reparto_pct, o.fecha;

-- ── Datos iniciales ────────────────────────────────────────────────────────
insert into public.concha_config (id) values (1) on conflict do nothing;
insert into public.concha_turnos (id, nombre, dias, inicio, fin, precio_base, suma_sello) values
  ('comida', 'Comida', '{1,2,3,4,5}', '12:00', '16:30', 13000, true),
  ('brunch', 'Brunch', '{6}', '09:30', '15:00', 0, null)            -- precio y sello pendientes
on conflict (id) do nothing;
insert into public.concha_descuentos (id, nombre, etiqueta, tipo, porcentaje, motivo, requiere_credencial) values
  ('petroil', 'Grupo Petroil', 'Petroil 10%', 'convenio', 10, null, true),
  ('cfe', 'CFE', 'CFE 10%', 'convenio', 10, null, true),
  ('judicial', 'Poder Judicial', 'Poder Judicial 10%', 'convenio', 10, null, true),
  ('cma', 'CMA', 'CMA 10%', 'convenio', 10, null, true),
  ('frecuente', 'Cliente frecuente', 'Cliente frecuente', 'cliente_frecuente', 100, 'cliente frecuente', false),
  ('cortesia', 'Cortesía', 'Cortesía', 'sin_cobro', 100, 'cortesía', false),
  ('personal', 'Comida de personal', 'Personal', 'sin_cobro', 100, 'personal', false),
  ('bruma', 'Bruma', 'Bruma', 'sin_cobro', 100, 'bruma', false)
on conflict (id) do nothing;
