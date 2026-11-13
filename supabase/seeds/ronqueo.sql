-- ─────────────────────────────────────────────────────────────────────────────
-- Ronqueo · venta de boletos de «All You Can Eat · Edición Ronqueo» (Bruma
-- Records, vie 20 nov 2026). Cobro con Stripe Checkout desde la edge function
-- `ronqueo-tickets`; aquí viven las órdenes, el cupo y los códigos BOLETO-XX (RONQUEO-XX
-- y CORTESÍA-XX son de las invitaciones de PR: ver ronqueo_invitaciones.sql).
--
-- Cómo se controla el cupo (50 lugares, contados por CANTIDAD):
--   · ronqueo_reservar() toma un candado transaccional (pg_advisory_xact_lock)
--     y suma lugares pagados + lugares pendientes que no han vencido. Si la
--     cantidad pedida cabe, inserta la orden pendiente con vencimiento de
--     31 min (la sesión de Stripe vence a los 30) y regresa su id. Con el
--     candado, dos compras simultáneas no pueden pasarse del cupo.
--   · checkout.session.expired (o el regreso por cancel_url) marca la orden
--     como vencida y los lugares vuelven al cupo de inmediato.
--
-- Idempotencia del webhook: ronqueo_confirmar() solo actúa si la orden NO
-- está pagada; el código sale de una secuencia una sola vez. El correo se
-- «reclama» (ronqueo_reclamar_correo) antes de enviarse, así que un reintento
-- de Stripe o la página de gracias no lo duplican.
--
-- Todo se escribe desde la edge function con service_role. RLS cerrado: el
-- público no lee ni escribe nada directo; el staff de HOG APP solo lee.
-- Ejecutar completo en el SQL editor de Supabase (es idempotente).
-- ─────────────────────────────────────────────────────────────────────────────

-- Configuración del evento — fuente de verdad del precio y del cupo que se COBRAN
create table if not exists public.ronqueo_config (
  id               boolean primary key default true check (id),
  cupo             int  not null default 50 check (cupo >= 0),
  max_por_compra   int  not null default 10 check (max_por_compra between 1 and 50),
  precio_centavos  int  not null default 150000 check (precio_centavos > 0), -- $1,500 MXN
  moneda           text not null default 'mxn',
  venta_abierta    boolean not null default true,
  updated_at       timestamptz not null default now()
);
insert into public.ronqueo_config (id) values (true) on conflict (id) do nothing;
-- Precio vigente (subió de $1,200 a $1,500); se aplica también a una base ya creada
update public.ronqueo_config set precio_centavos = 150000, updated_at = now() where id and precio_centavos <> 150000;

create sequence if not exists public.ronqueo_codigo_seq start 1;

create table if not exists public.ronqueo_orders (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  status              text not null default 'pending' check (status in ('pending', 'paid', 'expired')),
  nombre              text not null check (length(nombre) between 2 and 120),
  correo              text not null check (length(correo) between 5 and 200),
  whatsapp            text not null check (length(whatsapp) between 10 and 30),
  cantidad            int  not null check (cantidad between 1 and 50),
  monto_centavos      int  not null check (monto_centavos > 0),
  moneda              text not null default 'mxn',
  expires_at          timestamptz not null,
  stripe_session_id   text unique,
  stripe_payment_intent text,
  paid_at             timestamptz,
  codigo_num          int unique,
  codigo              text unique,
  email_claimed_at    timestamptz,
  email_sent_at       timestamptz,
  email_error         text
);
create index if not exists ronqueo_orders_status_idx on public.ronqueo_orders (status, expires_at);

alter table public.ronqueo_config enable row level security;
alter table public.ronqueo_orders enable row level security;

-- Staff de HOG APP: lectura (MASTER, C_LEVEL, DEV o quien tenga asignada la
-- app 'ronqueo' en Usuarios — la misma regla que la pantalla en App.tsx)
create or replace function public.fn_ronqueo_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select hog_role() in ('MASTER', 'C_LEVEL', 'DEV')
      or exists (select 1 from user_apps where user_id = auth.uid() and app = 'ronqueo')
$$;
revoke all on function public.fn_ronqueo_staff() from public;
grant execute on function public.fn_ronqueo_staff() to authenticated;

drop policy if exists ronqueo_orders_staff_sel on public.ronqueo_orders;
create policy ronqueo_orders_staff_sel on public.ronqueo_orders for select to authenticated using (fn_ronqueo_staff());
drop policy if exists ronqueo_config_staff_sel on public.ronqueo_config;
create policy ronqueo_config_staff_sel on public.ronqueo_config for select to authenticated using (fn_ronqueo_staff());

-- ── Estado del cupo ─────────────────────────────────────────────────────────
create or replace function public.ronqueo_estado()
returns json language sql stable set search_path = public as $$
  select json_build_object(
    'cupo', c.cupo,
    'vendidos', coalesce(sum(o.cantidad) filter (where o.status = 'paid'), 0),
    'reservados', coalesce(sum(o.cantidad) filter (where o.status = 'pending' and o.expires_at > now()), 0),
    'restantes', greatest(0, c.cupo
      - coalesce(sum(o.cantidad) filter (where o.status = 'paid'), 0)
      - coalesce(sum(o.cantidad) filter (where o.status = 'pending' and o.expires_at > now()), 0)),
    'maxPorCompra', c.max_por_compra,
    'precioCentavos', c.precio_centavos,
    'moneda', c.moneda,
    'ventaAbierta', c.venta_abierta
  )
  from ronqueo_config c
  left join ronqueo_orders o on true
  group by c.cupo, c.max_por_compra, c.precio_centavos, c.moneda, c.venta_abierta
$$;

-- ── Apartar lugares (antes de crear la sesión de Stripe) ────────────────────
-- Error 'agotado' con DETAIL = lugares que sí quedan.
create or replace function public.ronqueo_reservar(p_nombre text, p_correo text, p_whatsapp text, p_cantidad int)
returns json language plpgsql set search_path = public as $$
declare
  c ronqueo_config;
  ocupados int;
  restantes int;
  nueva uuid;
begin
  perform pg_advisory_xact_lock(hashtext('ronqueo_cupo'));
  select * into c from ronqueo_config where id;
  if not c.venta_abierta then
    raise exception 'venta_cerrada' using errcode = 'P0001', detail = '0';
  end if;
  if p_cantidad < 1 or p_cantidad > c.max_por_compra then
    raise exception 'cantidad_invalida' using errcode = 'P0001';
  end if;

  select coalesce(sum(cantidad), 0) into ocupados
    from ronqueo_orders
   where status = 'paid' or (status = 'pending' and expires_at > now());
  restantes := greatest(0, c.cupo - ocupados);

  if p_cantidad > restantes then
    raise exception 'agotado' using errcode = 'P0001', detail = restantes::text;
  end if;

  insert into ronqueo_orders (nombre, correo, whatsapp, cantidad, monto_centavos, moneda, expires_at)
  values (p_nombre, lower(p_correo), p_whatsapp, p_cantidad, p_cantidad * c.precio_centavos, c.moneda, now() + interval '31 minutes')
  returning id into nueva;

  return json_build_object('orden', nueva, 'monto_centavos', p_cantidad * c.precio_centavos,
                           'precio_centavos', c.precio_centavos, 'moneda', c.moneda,
                           'restantes', restantes - p_cantidad);
end $$;

-- ── Pago confirmado (webhook o página de gracias) — idempotente ─────────────
-- Asigna el código una sola vez. Si la orden ya estaba pagada, solo la regresa.
-- Si la orden había vencido pero Stripe sí cobró, se respeta el pago.
create or replace function public.ronqueo_confirmar(p_session_id text, p_payment_intent text)
returns setof public.ronqueo_orders language plpgsql set search_path = public as $$
declare
  n int;
begin
  update ronqueo_orders o
     set status = 'paid',
         paid_at = now(),
         stripe_payment_intent = coalesce(p_payment_intent, o.stripe_payment_intent),
         codigo_num = coalesce(o.codigo_num, nextval('ronqueo_codigo_seq')::int)
   where o.stripe_session_id = p_session_id and o.status <> 'paid';
  get diagnostics n = row_count;
  if n > 0 then
    update ronqueo_orders
       set codigo = 'BOLETO-' || lpad(codigo_num::text, 2, '0')
     where stripe_session_id = p_session_id and codigo is null;
  end if;
  return query select * from ronqueo_orders where stripe_session_id = p_session_id;
end $$;

-- ── Sesión vencida / cancelada: los lugares regresan al cupo ────────────────
create or replace function public.ronqueo_expirar(p_session_id text)
returns void language sql set search_path = public as $$
  update ronqueo_orders set status = 'expired'
   where stripe_session_id = p_session_id and status = 'pending'
$$;

-- ── Correo: reclamar el envío para no mandarlo dos veces ────────────────────
-- Un reclamo de más de 5 min sin envío se considera caído y se puede retomar.
create or replace function public.ronqueo_reclamar_correo(p_orden uuid)
returns boolean language plpgsql set search_path = public as $$
declare n int;
begin
  update ronqueo_orders set email_claimed_at = now()
   where id = p_orden and status = 'paid' and email_sent_at is null
     and (email_claimed_at is null or email_claimed_at < now() - interval '5 minutes');
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Solo la edge function (service_role) ejecuta las RPC de la venta
revoke all on function public.ronqueo_estado() from public, anon, authenticated;
revoke all on function public.ronqueo_reservar(text, text, text, int) from public, anon, authenticated;
revoke all on function public.ronqueo_confirmar(text, text) from public, anon, authenticated;
revoke all on function public.ronqueo_expirar(text) from public, anon, authenticated;
revoke all on function public.ronqueo_reclamar_correo(uuid) from public, anon, authenticated;
grant execute on function public.ronqueo_estado() to service_role, authenticated;
grant execute on function public.ronqueo_reservar(text, text, text, int) to service_role;
grant execute on function public.ronqueo_confirmar(text, text) to service_role;
grant execute on function public.ronqueo_expirar(text) to service_role;
grant execute on function public.ronqueo_reclamar_correo(uuid) to service_role;
revoke all on sequence public.ronqueo_codigo_seq from public, anon, authenticated;
grant usage on sequence public.ronqueo_codigo_seq to service_role;
