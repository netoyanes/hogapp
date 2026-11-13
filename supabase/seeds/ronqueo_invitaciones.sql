-- ─────────────────────────────────────────────────────────────────────────────
-- Ronqueo · invitaciones de PR (/pr/invitaciones)
--
-- El equipo de PR de Bruma Records genera invitaciones (venta o cortesía) y
-- las descarga como PNG. Aquí vive el registro: quién la generó, para quién,
-- con qué código, y si se anuló.
--
-- Acceso: link público sin índice + registro con celular y PIN (mismo patrón
-- que el portal de Obras). El PIN se guarda con bcrypt; 5 intentos fallidos
-- bloquean el celular 15 min. La sesión es un token al azar que la edge
-- function guarda hasheado (sha-256) y vence a los 30 días.
--
-- Códigos (únicos, nunca se reutilizan, ni anulados):
--   venta     RONQUEO-36, 37…  (del 01 al 35 ya se emitieron en Figma)
--   cortesía  CORTESÍA-09, 10… (del 01 al 08 ya existen en Figma)
-- Las compras del landing usan BOLETO-XX para no chocar con estos.
--
-- Todo se escribe desde la edge function `ronqueo-invitaciones` (service_role).
-- RLS cerrado; el staff de HOG APP solo lee. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create sequence if not exists public.ronqueo_inv_venta_seq start 36;
create sequence if not exists public.ronqueo_inv_cortesia_seq start 9;

create table if not exists public.ronqueo_pr_usuarios (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null check (length(trim(nombre)) between 2 and 60),
  telefono       text not null unique check (telefono ~ '^\d{10,13}$'),
  pin_hash       text not null,
  intentos       int  not null default 0,
  bloqueado_hasta timestamptz,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz
);

create table if not exists public.ronqueo_pr_sesiones (
  token_hash  text primary key,
  usuario_id  uuid not null references public.ronqueo_pr_usuarios(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days'
);

create table if not exists public.ronqueo_invitaciones (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique,
  tipo           text not null check (tipo in ('venta', 'cortesia')),
  numero         int  not null,
  nombre         text not null check (length(trim(nombre)) between 1 and 60),
  titular        text check (titular in ('invitada', 'invitado', 'invitados')),
  acompanantes   int  not null default 0 check (acompanantes between 0 and 10),
  firma          text not null,
  formato        text not null check (formato in ('feed', 'story', 'ambos')),
  creado_por     uuid references public.ronqueo_pr_usuarios(id) on delete set null,
  creado_por_nombre text,
  creado_por_tel text,
  created_at     timestamptz not null default now(),
  anulada_at     timestamptz,
  anulada_por    text,
  descargas      int  not null default 0,
  unique (tipo, numero)
);
create index if not exists ronqueo_inv_created_idx on public.ronqueo_invitaciones (created_at desc);

alter table public.ronqueo_pr_usuarios enable row level security;
alter table public.ronqueo_pr_sesiones enable row level security;
alter table public.ronqueo_invitaciones enable row level security;

-- Staff de HOG APP (misma regla que ronqueo_orders): solo lectura
drop policy if exists ronqueo_inv_staff_sel on public.ronqueo_invitaciones;
create policy ronqueo_inv_staff_sel on public.ronqueo_invitaciones for select to authenticated using (fn_ronqueo_staff());

-- ── Registro / entrada con celular + PIN ────────────────────────────────────
create or replace function public.ronqueo_pr_registro(p_nombre text, p_telefono text, p_pin text)
returns jsonb language plpgsql set search_path = public as $$
declare v_tel text; v_id uuid;
begin
  v_tel := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  if length(trim(coalesce(p_nombre, ''))) < 2 then return jsonb_build_object('error', 'escribe tu nombre.'); end if;
  if length(v_tel) < 10 then return jsonb_build_object('error', 'escribe tu celular a 10 dígitos.'); end if;
  if coalesce(p_pin, '') !~ '^\d{4,6}$' then return jsonb_build_object('error', 'el pin son 4 a 6 números.'); end if;
  if exists (select 1 from ronqueo_pr_usuarios where telefono = v_tel) then
    return jsonb_build_object('error', 'ese celular ya está registrado. entra con tu pin.');
  end if;
  insert into ronqueo_pr_usuarios (nombre, telefono, pin_hash, last_seen_at)
  values (trim(p_nombre), v_tel, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), now())
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.ronqueo_pr_login(p_telefono text, p_pin text)
returns jsonb language plpgsql set search_path = public as $$
declare v_tel text; v_u ronqueo_pr_usuarios;
begin
  v_tel := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  select * into v_u from ronqueo_pr_usuarios where telefono = v_tel;
  if not found then return jsonb_build_object('nuevo', true); end if;
  if v_u.bloqueado_hasta is not null and v_u.bloqueado_hasta > now() then
    return jsonb_build_object('error', 'demasiados intentos. espera 15 minutos.');
  end if;
  if v_u.pin_hash <> extensions.crypt(coalesce(p_pin, ''), v_u.pin_hash) then
    update ronqueo_pr_usuarios
       set intentos = intentos + 1,
           bloqueado_hasta = case when intentos + 1 >= 5 then now() + interval '15 minutes' else null end
     where id = v_u.id;
    return jsonb_build_object('error', 'pin incorrecto.');
  end if;
  update ronqueo_pr_usuarios set intentos = 0, bloqueado_hasta = null, last_seen_at = now() where id = v_u.id;
  return jsonb_build_object('id', v_u.id);
end $$;

-- ── Emitir: toma el siguiente consecutivo y guarda la invitación ────────────
create or replace function public.ronqueo_inv_emitir(
  p_tipo text, p_nombre text, p_titular text, p_acompanantes int, p_firma text, p_formato text, p_usuario uuid
) returns setof public.ronqueo_invitaciones language plpgsql set search_path = public as $$
declare v_n int; v_codigo text; v_u ronqueo_pr_usuarios;
begin
  select * into v_u from ronqueo_pr_usuarios where id = p_usuario;
  if p_tipo = 'venta' then
    v_n := nextval('ronqueo_inv_venta_seq');
    v_codigo := 'RONQUEO-' || lpad(v_n::text, 2, '0');
  elsif p_tipo = 'cortesia' then
    v_n := nextval('ronqueo_inv_cortesia_seq');
    v_codigo := 'CORTESÍA-' || lpad(v_n::text, 2, '0');
  else
    raise exception 'tipo inválido';
  end if;
  return query
  insert into ronqueo_invitaciones (codigo, tipo, numero, nombre, titular, acompanantes, firma, formato, creado_por, creado_por_nombre, creado_por_tel)
  values (v_codigo, p_tipo, v_n, trim(p_nombre),
          case when p_tipo = 'cortesia' then coalesce(p_titular, 'invitada') end,
          case when p_tipo = 'cortesia' then greatest(0, coalesce(p_acompanantes, 1)) else 0 end,
          p_firma, p_formato, p_usuario, v_u.nombre, v_u.telefono)
  returning *;
end $$;

revoke all on function public.ronqueo_pr_registro(text, text, text) from public, anon, authenticated;
revoke all on function public.ronqueo_pr_login(text, text) from public, anon, authenticated;
revoke all on function public.ronqueo_inv_emitir(text, text, text, int, text, text, uuid) from public, anon, authenticated;
grant execute on function public.ronqueo_pr_registro(text, text, text) to service_role;
grant execute on function public.ronqueo_pr_login(text, text) to service_role;
grant execute on function public.ronqueo_inv_emitir(text, text, text, int, text, text, uuid) to service_role;
revoke all on sequence public.ronqueo_inv_venta_seq, public.ronqueo_inv_cortesia_seq from public, anon, authenticated;
grant usage on sequence public.ronqueo_inv_venta_seq, public.ronqueo_inv_cortesia_seq to service_role;

-- ── Compras del landing: BOLETO-XX (antes RONQUEO-XX) ───────────────────────
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
