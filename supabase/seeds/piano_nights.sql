-- ═════════════════════════════════════════════════════════════════════════════
-- PIANO NIGHTS · letras en vivo para el público
--
-- En la noche de piano la gente quiere cantar, pero no se sabe la letra. Cada
-- mesa tiene un QR que abre ?letras=CODIGO (ej. ?letras=AM): el portal muestra
-- la canción que está sonando con su letra, y se mueve solo cuando el músico
-- (o el staff) pasa a la siguiente.
--
-- Tres piezas:
--  · piano_canciones: el repertorio. Se captura UNA vez y se reusa cada noche.
--  · piano_noches:    una noche por venue y fecha. actual_id es lo que suena.
--  · piano_setlist:   el orden de la noche. tocada_at marca lo que ya pasó.
--
-- ACCESO: app 'pianobar' (user_apps) o Master, para leer y escribir. El
-- público NUNCA toca las tablas: lee por fn_piano_live (anon, security
-- definer), que devuelve solo la noche en vivo — nada de notas internas.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Permisos ─────────────────────────────────────────────────────────────────
create or replace function public.fn_can_piano()
returns boolean language sql stable security definer set search_path = public as $$
  select hog_role() = 'MASTER'
      or exists (select 1 from user_apps where user_id = auth.uid() and app = 'pianobar')
$$;

revoke all on function public.fn_can_piano() from public;
grant execute on function public.fn_can_piano() to authenticated;

-- ── 1. Repertorio ────────────────────────────────────────────────────────────
-- Global, no por venue: la misma "Bésame mucho" se toca en Mazatlán y en Roma.
create table if not exists piano_canciones (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null,
  artista    text,
  letra      text not null default '',
  -- Tono y notas son para el músico; el público no los ve.
  tono       text,
  notas      text,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- ── 2. Noches ────────────────────────────────────────────────────────────────
create table if not exists piano_noches (
  id         uuid primary key default gen_random_uuid(),
  bu_id      uuid not null references business_units(id) on delete cascade,
  fecha      date not null default current_date,
  titulo     text not null default 'piano nights',
  -- programada → en_vivo → cerrada. Solo una noche en vivo por venue: el QR
  -- de la mesa no sabe de fechas, abre "la que está sonando".
  estado     text not null default 'programada'
             check (estado in ('programada', 'en_vivo', 'cerrada')),
  actual_id  uuid,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create unique index if not exists piano_noches_una_en_vivo
  on piano_noches (bu_id) where estado = 'en_vivo';

-- ── 3. Setlist ───────────────────────────────────────────────────────────────
create table if not exists piano_setlist (
  id         uuid primary key default gen_random_uuid(),
  noche_id   uuid not null references piano_noches(id) on delete cascade,
  -- restrict: borrar una canción que ya se tocó rompería el histórico de la
  -- noche. Para sacarla del repertorio se desactiva.
  cancion_id uuid not null references piano_canciones(id) on delete restrict,
  orden      integer not null default 0,
  tocada_at  timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists piano_setlist_noche on piano_setlist (noche_id, orden);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'piano_noches_actual_fk') then
    alter table piano_noches add constraint piano_noches_actual_fk
      foreign key (actual_id) references piano_setlist(id) on delete set null;
  end if;
end $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table piano_canciones enable row level security;
alter table piano_noches    enable row level security;
alter table piano_setlist   enable row level security;

do $$ declare t text; begin
  foreach t in array array['piano_canciones', 'piano_noches', 'piano_setlist'] loop
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format('create policy %I_all on %I for all to authenticated using (fn_can_piano()) with check (fn_can_piano())', t, t);
  end loop;
end $$;

-- ── Qué suena (staff) ────────────────────────────────────────────────────────
-- Un solo paso atómico: lo que sonaba queda como tocado y el nuevo pasa a
-- sonar. Si fueran dos updates desde el teléfono del músico, una mala señal
-- en el escenario deja la noche a medias. p_item null = pausa (nada suena).
create or replace function public.fn_piano_sonar(p_noche uuid, p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_prev uuid;
begin
  if not fn_can_piano() then raise exception 'sin acceso'; end if;
  if p_item is not null and not exists (
    select 1 from piano_setlist where id = p_item and noche_id = p_noche
  ) then raise exception 'la canción no es de esta noche'; end if;

  select actual_id into v_prev from piano_noches where id = p_noche for update;
  if v_prev is not null and v_prev is distinct from p_item then
    update piano_setlist set tocada_at = coalesce(tocada_at, now()) where id = v_prev;
  end if;
  -- Volver a una canción ya tocada (bis) la regresa a "sonando".
  if p_item is not null then
    update piano_setlist set tocada_at = null where id = p_item;
  end if;
  update piano_noches set actual_id = p_item, updated_at = now() where id = p_noche;
end $$;

revoke all on function public.fn_piano_sonar(uuid, uuid) from public;
grant execute on function public.fn_piano_sonar(uuid, uuid) to authenticated;

-- ── RPC PÚBLICO (el QR de la mesa, vía anon) ─────────────────────────────────
-- Devuelve la noche en vivo del venue: lo que suena con su letra y lo que ya
-- sonó (para regresar a una letra). De lo que viene solo el conteo — la
-- sorpresa es parte de la noche. Sin noche en vivo, la próxima programada
-- para que el QR nunca abra en blanco.
create or replace function public.fn_piano_live(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_bu    business_units%rowtype;
  v_noche piano_noches%rowtype;
  v_hoy   date;
begin
  select * into v_bu from business_units where lower(code) = lower(p_code) limit 1;
  if not found then return null; end if;
  v_hoy := (now() at time zone coalesce(nullif(v_bu.timezone, ''), 'America/Mazatlan'))::date;

  select * into v_noche from piano_noches
   where bu_id = v_bu.id and estado = 'en_vivo'
   order by fecha desc limit 1;

  if not found then
    return jsonb_build_object(
      'venue', v_bu.name, 'code', v_bu.code, 'en_vivo', false,
      'proxima', (select jsonb_build_object('fecha', n.fecha, 'titulo', n.titulo)
                    from piano_noches n
                   where n.bu_id = v_bu.id and n.estado = 'programada' and n.fecha >= v_hoy
                   order by n.fecha limit 1)
    );
  end if;

  return jsonb_build_object(
    'venue',   v_bu.name,
    'code',    v_bu.code,
    'en_vivo', true,
    'noche',   jsonb_build_object('id', v_noche.id, 'fecha', v_noche.fecha, 'titulo', v_noche.titulo),
    'rev',     extract(epoch from v_noche.updated_at),
    'actual',  (select jsonb_build_object('id', s.id, 'titulo', c.titulo, 'artista', c.artista, 'letra', c.letra)
                  from piano_setlist s join piano_canciones c on c.id = s.cancion_id
                 where s.id = v_noche.actual_id),
    'tocadas', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', s.id, 'titulo', c.titulo, 'artista', c.artista, 'letra', c.letra
                 ) order by s.tocada_at desc)
                  from piano_setlist s join piano_canciones c on c.id = s.cancion_id
                 where s.noche_id = v_noche.id and s.tocada_at is not null
                   and s.id is distinct from v_noche.actual_id), '[]'::jsonb),
    'restantes', (select count(*) from piano_setlist s
                   where s.noche_id = v_noche.id and s.tocada_at is null
                     and s.id is distinct from v_noche.actual_id)
  );
end $$;

revoke all on function public.fn_piano_live(text) from public;
grant execute on function public.fn_piano_live(text) to anon, authenticated;

-- ── Mover el setlist toca updated_at de la noche ─────────────────────────────
-- El portal compara 'rev' para no repintar (ni mover el scroll de quien está
-- leyendo) cuando nada cambió.
create or replace function public.fn_piano_touch_noche()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update piano_noches set updated_at = now()
   where id = coalesce(new.noche_id, old.noche_id);
  return coalesce(new, old);
end $$;

drop trigger if exists piano_setlist_touch on piano_setlist;
create trigger piano_setlist_touch after insert or update or delete on piano_setlist
  for each row execute function fn_piano_touch_noche();

create or replace function public.fn_piano_noche_updated()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists piano_noches_updated on piano_noches;
create trigger piano_noches_updated before update on piano_noches
  for each row execute function fn_piano_noche_updated();

-- Editar una letra a media noche también debe llegar a las mesas.
create or replace function public.fn_piano_touch_cancion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update piano_noches n set updated_at = now()
   where n.estado = 'en_vivo'
     and exists (select 1 from piano_setlist s where s.noche_id = n.id and s.cancion_id = new.id);
  return new;
end $$;

drop trigger if exists piano_canciones_touch on piano_canciones;
create trigger piano_canciones_touch after update on piano_canciones
  for each row execute function fn_piano_touch_cancion();

-- Supabase da EXECUTE a anon en cada función nueva (default privileges), y el
-- revoke de public de arriba no lo quita. El público solo debe ver
-- fn_piano_live; lo demás, cerrado explícitamente.
revoke execute on function public.fn_can_piano() from anon;
revoke execute on function public.fn_piano_sonar(uuid, uuid) from anon;
revoke execute on function public.fn_piano_touch_noche() from public, anon, authenticated;
revoke execute on function public.fn_piano_touch_cancion() from public, anon, authenticated;
revoke execute on function public.fn_piano_noche_updated() from public, anon, authenticated;

notify pgrst, 'reload schema';
