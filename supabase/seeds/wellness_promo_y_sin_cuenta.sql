-- ═════════════════════════════════════════════════════════════════════════════
-- WELLNESS · RESERVA SIN CUENTA Y PROMOCIÓN DE PRIMERA CLASE
--
-- Dos reglas de negocio que hasta ahora no existían en la base:
--
--   1. Se puede apartar SIN crear cuenta, pagando precio de lista. Registrarse
--      es lo que da el descuento; si el descuento aplicara igual, el registro
--      no tendría razón de ser.
--   2. El descuento es de PRIMERA CLASE y con fecha límite (septiembre).
--      Antes se aplicaba a toda reserva, para siempre.
--
-- La vigencia va como DATO en wellness_config, no dentro de la función: así
-- extenderla, acortarla o apagarla es editar una fila, no desplegar código.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Requiere wellness.sql, wellness_alumnos.sql y wellness_ticket.sql.
-- ═════════════════════════════════════════════════════════════════════════════

alter table wellness_config add column if not exists promo_hasta date;
alter table wellness_config add column if not exists promo_solo_primera boolean not null default true;

comment on column wellness_config.promo_hasta is 'Último día en que aplica el descuento (por fecha de clase). NULL = sin límite.';
comment on column wellness_config.promo_solo_primera is 'true = el descuento solo aplica a la primera clase del alumno.';

-- Apertura de POD Condesa: -40 en la primera clase, hasta fin de septiembre.
update wellness_config cfg set promo_hasta = date '2026-09-30', promo_solo_primera = true
  from business_units b where b.id = cfg.bu_id and b.code = 'PC';

-- ─── Reservar CON cuenta: aquí se evalúa la promoción ────────────────────────
create or replace function public.fn_wellness_book(p_token uuid, p_slot uuid, p_date date)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_student uuid; v_cap int; v_booked int; v_price numeric;
  v_weekday int; v_booking uuid; v_pct numeric; v_code text;
  v_regular numeric; v_vigente numeric; v_hasta date; v_solo_primera boolean;
  v_es_primera boolean; v_con_descuento boolean;
begin
  select id into v_student from wellness_students where access_token = p_token;
  if v_student is null then return jsonb_build_object('error', 'Tu acceso no es válido — entra de nuevo con tu teléfono.'); end if;

  select c.capacity, c.price, s.weekday, i.revenue_pct,
         cfg.precio_regular, cfg.precio_vigente, cfg.promo_hasta, coalesce(cfg.promo_solo_primera, true)
    into v_cap, v_price, v_weekday, v_pct, v_regular, v_vigente, v_hasta, v_solo_primera
    from wellness_slots s
    join wellness_classes c on c.id = s.class_id
    left join wellness_instructors i on i.id = c.instructor_id
    left join wellness_config cfg on cfg.bu_id = c.bu_id
   where s.id = p_slot and s.active and c.active;

  if v_cap is null then return jsonb_build_object('error', 'Esa clase ya no está disponible.'); end if;
  if extract(dow from p_date)::int <> v_weekday or p_date < current_date then
    return jsonb_build_object('error', 'Fecha inválida para ese horario.');
  end if;
  select count(*) into v_booked from wellness_bookings
   where slot_id = p_slot and class_date = p_date and status <> 'cancelada';
  if v_booked >= v_cap then return jsonb_build_object('error', 'Esa clase ya está llena.'); end if;

  -- ¿Es su primera clase? Cuenta cualquier reserva viva anterior, incluida una
  -- hecha sin cuenta con el mismo teléfono: si ya vino, ya no es la primera.
  select not exists (
    select 1 from wellness_bookings b
     where b.student_id = v_student and b.status <> 'cancelada'
  ) into v_es_primera;

  -- El descuento se mide contra la FECHA DE LA CLASE, no la de la reserva: es
  -- el día que se cobra en caja, y así nadie aparta el 30 de septiembre una
  -- clase de noviembre para llevarse el precio de promoción.
  v_con_descuento := coalesce(v_vigente, 0) > 0
    and coalesce(v_regular, 0) > coalesce(v_vigente, 0)
    and (v_hasta is null or p_date <= v_hasta)
    and (not v_solo_primera or v_es_primera);

  if v_con_descuento then v_price := v_vigente;
  elsif coalesce(v_regular, 0) > 0 then v_price := v_regular;
  end if;

  insert into wellness_bookings (slot_id, class_date, student_id, amount, instructor_pct)
  values (p_slot, p_date, v_student, v_price, v_pct)
  on conflict (slot_id, class_date, student_id) do update set status = 'reservada'
  returning id, code into v_booking, v_code;

  return jsonb_build_object(
    'booking_id', v_booking, 'amount', v_price, 'code', v_code,
    'con_descuento', v_con_descuento);
end $fn$;

-- ─── Reservar SIN cuenta: precio de lista, sin token ─────────────────────────
-- Se crea (o reutiliza) la fila en wellness_students porque en caja necesitan
-- nombre y teléfono para encontrar la reserva. Lo que NO se devuelve es el
-- access_token: sin token no hay portal de "mis clases", que es justo lo que se
-- gana al registrarse. Si esa persona se registra después con el mismo
-- teléfono, fn_wellness_register le devuelve ese mismo registro y hereda su
-- historial — no queda partido en dos.
create or replace function public.fn_wellness_book_guest(
  p_name text, p_phone text, p_slot uuid, p_date date)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_student wellness_students; v_tel text;
  v_cap int; v_booked int; v_price numeric; v_weekday int;
  v_pct numeric; v_regular numeric; v_booking uuid; v_code text;
begin
  v_tel := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(trim(coalesce(p_name, ''))) < 3 or length(v_tel) < 10 then
    return jsonb_build_object('error', 'Nombre y teléfono (10 dígitos) son obligatorios.');
  end if;

  select c.capacity, c.price, s.weekday, i.revenue_pct, cfg.precio_regular
    into v_cap, v_price, v_weekday, v_pct, v_regular
    from wellness_slots s
    join wellness_classes c on c.id = s.class_id
    left join wellness_instructors i on i.id = c.instructor_id
    left join wellness_config cfg on cfg.bu_id = c.bu_id
   where s.id = p_slot and s.active and c.active;

  if v_cap is null then return jsonb_build_object('error', 'Esa clase ya no está disponible.'); end if;
  if extract(dow from p_date)::int <> v_weekday or p_date < current_date then
    return jsonb_build_object('error', 'Fecha inválida para ese horario.');
  end if;
  select count(*) into v_booked from wellness_bookings
   where slot_id = p_slot and class_date = p_date and status <> 'cancelada';
  if v_booked >= v_cap then return jsonb_build_object('error', 'Esa clase ya está llena.'); end if;

  -- Sin cuenta se paga el precio DE LISTA. El vigente es la recompensa por
  -- registrarse, y aplicarlo aquí vaciaría de sentido el registro.
  if coalesce(v_regular, 0) > 0 then v_price := v_regular; end if;

  select * into v_student from wellness_students where phone = v_tel;
  if found then
    -- El mismo resguardo que en el registro: un teléfono ajeno no debe poder
    -- colgarle reservas a otra persona.
    if lower(split_part(trim(v_student.full_name), ' ', 1)) <> lower(split_part(trim(p_name), ' ', 1)) then
      return jsonb_build_object('error', 'Ese teléfono ya está registrado con otro nombre. Escríbenos si es tuyo.');
    end if;
  else
    insert into wellness_students (full_name, phone)
    values (trim(p_name), v_tel)
    returning * into v_student;
  end if;

  insert into wellness_bookings (slot_id, class_date, student_id, amount, instructor_pct)
  values (p_slot, p_date, v_student.id, v_price, v_pct)
  on conflict (slot_id, class_date, student_id) do update set status = 'reservada'
  returning id, code into v_booking, v_code;

  -- Nada de token en la respuesta: eso es lo que se gana registrándose.
  return jsonb_build_object('booking_id', v_booking, 'amount', v_price, 'code', v_code);
end $fn$;

revoke all on function public.fn_wellness_book_guest(text, text, uuid, date) from public;
do $g$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.fn_wellness_book_guest(text, text, uuid, date) to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.fn_wellness_book_guest(text, text, uuid, date) to authenticated;
  end if;
end $g$;

-- ─── El portal necesita explicar la regla, no solo el número ─────────────────
create or replace function public.fn_wellness_info(p_code text)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'venue',              b.name,
    'code',               b.code,
    'precio_regular',     c.precio_regular,
    'descuento',          c.descuento,
    'precio_vigente',     c.precio_vigente,
    'promo_hasta',        c.promo_hasta,
    'promo_solo_primera', coalesce(c.promo_solo_primera, true),
    -- Vigente de verdad: hay descuento Y la promoción no ha vencido.
    'promocion',          coalesce(c.descuento, 0) > 0
                            and (c.promo_hasta is null or c.promo_hasta >= current_date)
  )
  from business_units b
  left join wellness_config c on c.bu_id = b.id
  where lower(b.code) = lower(p_code)
  limit 1
$fn$;

-- ─── Y saber si a ESTE alumno todavía le toca ────────────────────────────────
create or replace function public.fn_wellness_me(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'name',       st.full_name,
    'phone',      st.phone,
    'email',      st.email,
    'since',      st.created_at,
    'tomadas',    (select count(*) from wellness_bookings b where b.student_id = st.id and b.status = 'asistio'),
    'reservadas', (select count(*) from wellness_bookings b where b.student_id = st.id and b.status = 'reservada'),
    -- Si el descuento es solo para la primera clase, esto dice si sigue
    -- disponible. El portal lo usa para no prometer un precio que ya se usó.
    'primera_disponible', not exists (
      select 1 from wellness_bookings b where b.student_id = st.id and b.status <> 'cancelada'),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'booking_id', b.id, 'code', b.code, 'class', c.name, 'class_date', b.class_date,
        'start_time', to_char(s.start_time, 'HH24:MI'), 'instructor', i.full_name,
        'status', b.status, 'paid', b.paid, 'paid_via', b.paid_via, 'amount', b.amount
      ) order by b.class_date desc)
      from wellness_bookings b
      join wellness_slots s on s.id = b.slot_id
      join wellness_classes c on c.id = s.class_id
      left join wellness_instructors i on i.id = c.instructor_id
      where b.student_id = st.id), '[]'::jsonb))
  from wellness_students st where st.access_token = p_token
$fn$;

notify pgrst, 'reload schema';
