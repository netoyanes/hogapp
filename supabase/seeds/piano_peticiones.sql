-- ═════════════════════════════════════════════════════════════════════════════
-- PIANO NIGHTS · peticiones del público
--
-- Desde el mismo QR de la mesa, la gente pone su nombre y pide una canción:
-- una del repertorio ("apartarla") o una que no está (sugerencia libre). El
-- staff las ve en La noche, las manda al setlist o las descarta, y cuando
-- suena, el portal dice quién la pidió.
--
-- Para pedir se registra con nombre y celular. El celular es la identidad:
-- con él la persona cae en GUESTS (la lista de clientes de Concierge/CRM,
-- upsert por teléfono, misma regla que la reserva pública) con la etiqueta
-- 'piano nights'. Así cada noche de piano suma clientes a la base, con
-- nombre y WhatsApp, sin capturar nada a mano.
--
-- Además el teléfono guarda un id de visitante (localStorage) para reconocer
-- el dispositivo entre recargas y limitar a 3 peticiones pendientes por
-- persona por noche.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente. Requiere piano_nights.sql.
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists piano_peticiones (
  id          uuid primary key default gen_random_uuid(),
  noche_id    uuid not null references piano_noches(id) on delete cascade,
  visitante   uuid not null,
  guest_id    uuid references guests(id) on delete set null,
  nombre      text not null,
  telefono    text not null,
  -- Una de dos: cancion_id (del repertorio) o sugerencia (texto libre).
  cancion_id  uuid references piano_canciones(id) on delete set null,
  sugerencia  text,
  -- pendiente → aceptada (ya está en el setlist, item_id) → tocada · o descartada
  estado      text not null default 'pendiente'
              check (estado in ('pendiente', 'aceptada', 'tocada', 'descartada')),
  item_id     uuid references piano_setlist(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint piano_peticiones_una_cosa check (cancion_id is not null or nullif(trim(sugerencia), '') is not null)
);

create index if not exists piano_peticiones_noche on piano_peticiones (noche_id, estado, created_at);
create index if not exists piano_peticiones_guest on piano_peticiones (guest_id);
-- La misma persona (mismo celular) no pide la misma canción dos veces en la noche.
create unique index if not exists piano_peticiones_sin_repetir
  on piano_peticiones (noche_id, telefono, cancion_id) where cancion_id is not null;

alter table piano_peticiones enable row level security;
drop policy if exists piano_peticiones_all on piano_peticiones;
create policy piano_peticiones_all on piano_peticiones
  for all to authenticated using (fn_can_piano()) with check (fn_can_piano());

-- Mover peticiones también refresca el portal (rev de la noche).
drop trigger if exists piano_peticiones_touch on piano_peticiones;
create trigger piano_peticiones_touch after insert or update or delete on piano_peticiones
  for each row execute function fn_piano_touch_noche();

-- Cuando el item del setlist pasa a sonar, su petición queda como tocada.
create or replace function public.fn_piano_peticion_tocada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.actual_id is not null and new.actual_id is distinct from old.actual_id then
    update piano_peticiones set estado = 'tocada'
     where item_id = new.actual_id and estado = 'aceptada';
  end if;
  return new;
end $$;
revoke execute on function public.fn_piano_peticion_tocada() from public, anon, authenticated;

drop trigger if exists piano_noches_peticion_tocada on piano_noches;
create trigger piano_noches_peticion_tocada after update of actual_id on piano_noches
  for each row execute function fn_piano_peticion_tocada();

-- ── La noche que recibe peticiones ───────────────────────────────────────────
-- La que está en vivo; si no hay, la programada para HOY (la gente llega
-- antes de que arranque el piano y ya quiere pedir).
create or replace function public.fn_piano_noche_abierta(p_bu uuid, p_tz text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from piano_noches
   where bu_id = p_bu
     and (estado = 'en_vivo'
          or (estado = 'programada' and fecha = (now() at time zone coalesce(nullif(p_tz, ''), 'America/Mazatlan'))::date))
   order by (estado = 'en_vivo') desc, fecha limit 1
$$;
revoke execute on function public.fn_piano_noche_abierta(uuid, text) from public, anon, authenticated;

-- ── RPCs PÚBLICOS ────────────────────────────────────────────────────────────
-- El repertorio para pedir: solo título e intérprete, y cuántos ya la
-- pidieron hoy. Nada de letras, tonos ni notas.
create or replace function public.fn_piano_repertorio(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_bu business_units%rowtype; v_noche uuid;
begin
  select * into v_bu from business_units where lower(code) = lower(p_code) limit 1;
  if not found then return null; end if;
  v_noche := fn_piano_noche_abierta(v_bu.id, v_bu.timezone);
  return jsonb_build_object(
    'abierta', v_noche is not null,
    'canciones', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'titulo', c.titulo, 'artista', c.artista,
        'pedidas', (select count(*) from piano_peticiones p
                     where p.noche_id = v_noche and p.cancion_id = c.id and p.estado <> 'descartada')
      ) order by c.titulo)
      from piano_canciones c where c.activo), '[]'::jsonb)
  );
end $$;
revoke all on function public.fn_piano_repertorio(text) from public;
grant execute on function public.fn_piano_repertorio(text) to anon, authenticated;

-- Teléfono a E.164, misma regla que src/lib/phone.ts (MX por default).
create or replace function public.fn_piano_telefono(p_raw text)
returns text language plpgsql immutable as $$
declare d text;
begin
  d := regexp_replace(coalesce(p_raw, ''), '\D', '', 'g');
  if trim(coalesce(p_raw, '')) like '+%' then
    return case when d ~ '^[1-9][0-9]{7,14}$' then '+' || d end;
  end if;
  if length(d) = 10 then return '+52' || d; end if;
  if length(d) = 12 and d like '52%' then return '+' || d; end if;
  if length(d) = 13 and d like '521%' then return '+52' || substr(d, 4); end if;
  if length(d) = 11 and d like '1%' then return '+' || d; end if;
  return null;
end $$;
revoke execute on function public.fn_piano_telefono(text) from public, anon, authenticated;

-- Pedir. Devuelve {ok} o {error} con un texto para mostrar tal cual.
-- Registra (o reconoce) al cliente en guests por teléfono. El nombre que ya
-- tenía un cliente conocido NO se pisa: lo capturó el staff con más cuidado.
create or replace function public.fn_piano_pedir(
  p_code text, p_visitante uuid, p_nombre text, p_telefono text, p_cancion uuid, p_sugerencia text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_bu business_units%rowtype; v_noche uuid; v_nombre text; v_tel text; v_sug text; v_guest uuid; v_id uuid;
begin
  select * into v_bu from business_units where lower(code) = lower(p_code) limit 1;
  if not found then return jsonb_build_object('error', 'Este QR no es de aquí.'); end if;
  v_noche := fn_piano_noche_abierta(v_bu.id, v_bu.timezone);
  if v_noche is null then return jsonb_build_object('error', 'Hoy no hay noche de piano. Vuelve la próxima.'); end if;

  v_nombre := left(trim(coalesce(p_nombre, '')), 40);
  if length(v_nombre) < 2 then return jsonb_build_object('error', 'Dinos tu nombre para anunciarte.'); end if;
  v_tel := fn_piano_telefono(p_telefono);
  if v_tel is null then return jsonb_build_object('error', 'Ese celular no se ve bien — son 10 dígitos.'); end if;
  v_sug := nullif(left(trim(coalesce(p_sugerencia, '')), 120), '');
  if p_cancion is null and v_sug is null then return jsonb_build_object('error', 'Elige una canción o escribe cuál quieres.'); end if;
  if p_cancion is not null and not exists (select 1 from piano_canciones where id = p_cancion and activo) then
    return jsonb_build_object('error', 'Esa canción ya no está en el repertorio.');
  end if;
  if (select count(*) from piano_peticiones where noche_id = v_noche and telefono = v_tel and estado = 'pendiente') >= 3 then
    return jsonb_build_object('error', 'Ya tienes 3 peticiones esperando. Deja que suenen y pide otra.');
  end if;
  if p_cancion is not null and exists (
    select 1 from piano_peticiones where noche_id = v_noche and telefono = v_tel and cancion_id = p_cancion
  ) then return jsonb_build_object('error', 'Esa ya la pediste esta noche.'); end if;

  -- Cliente: alta o reconocimiento por teléfono. Aceptó el aviso al pedir.
  insert into guests (phone, full_name, origin_bu, tags, consent_terms, consent_terms_at)
  values (v_tel, v_nombre, v_bu.id, array['piano nights'], true, now())
  on conflict (phone) do update
    set tags = case when 'piano nights' = any(guests.tags) then guests.tags else guests.tags || 'piano nights'::text end
  returning id into v_guest;

  insert into piano_peticiones (noche_id, visitante, guest_id, nombre, telefono, cancion_id, sugerencia)
  values (v_noche, p_visitante, v_guest, v_nombre, v_tel, p_cancion, case when p_cancion is null then v_sug else null end)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.fn_piano_pedir(text, uuid, text, text, uuid, text) from public;
grant execute on function public.fn_piano_pedir(text, uuid, text, text, uuid, text) to anon, authenticated;

-- Mis peticiones de la noche abierta, con su estado.
create or replace function public.fn_piano_mis_peticiones(p_code text, p_visitante uuid, p_telefono text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_bu business_units%rowtype; v_noche uuid;
begin
  select * into v_bu from business_units where lower(code) = lower(p_code) limit 1;
  if not found then return '[]'::jsonb; end if;
  v_noche := fn_piano_noche_abierta(v_bu.id, v_bu.timezone);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'estado', p.estado,
      'titulo', coalesce(c.titulo, p.sugerencia), 'artista', c.artista,
      'sugerencia', p.cancion_id is null
    ) order by p.created_at desc)
    from piano_peticiones p left join piano_canciones c on c.id = p.cancion_id
    where p.noche_id = v_noche
      and (p.visitante = p_visitante or p.telefono = fn_piano_telefono(p_telefono))), '[]'::jsonb);
end $$;
revoke all on function public.fn_piano_mis_peticiones(text, uuid, text) from public;
grant execute on function public.fn_piano_mis_peticiones(text, uuid, text) to anon, authenticated;

-- ── fn_piano_live: quién pidió lo que suena ──────────────────────────────────
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
    'actual',  (select jsonb_build_object('id', s.id, 'titulo', c.titulo, 'artista', c.artista, 'autores', c.autores, 'letra', c.letra,
                  'pedida_por', (select string_agg(p.nombre, ', ' order by p.created_at)
                                   from piano_peticiones p where p.item_id = s.id and p.estado <> 'descartada'))
                  from piano_setlist s join piano_canciones c on c.id = s.cancion_id
                 where s.id = v_noche.actual_id),
    'tocadas', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', s.id, 'titulo', c.titulo, 'artista', c.artista, 'autores', c.autores, 'letra', c.letra
                 ) order by s.tocada_at desc)
                  from piano_setlist s join piano_canciones c on c.id = s.cancion_id
                 where s.noche_id = v_noche.id and s.tocada_at is not null
                   and s.id is distinct from v_noche.actual_id), '[]'::jsonb),
    'restantes', (select count(*) from piano_setlist s
                   where s.noche_id = v_noche.id and s.tocada_at is null
                     and s.id is distinct from v_noche.actual_id)
  );
end $$;

notify pgrst, 'reload schema';
