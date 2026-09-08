-- ═════════════════════════════════════════════════════════════════════════════
-- WELLNESS · ACCESO DE ALUMNOS Y PRECIO POR REGISTRO
--
-- La regla de negocio nueva: quien se REGISTRA paga el precio con descuento;
-- quien llega de mostrador sin registrarse paga el precio regular. El descuento
-- deja de ser "promoción para todos" y pasa a ser la razón para registrarse.
--
-- Eso toca tres cosas:
--
--   1. fn_wellness_book cobraba wellness_classes.price e ignoraba la
--      configuración del venue. Ahora cobra el precio VIGENTE — quien reserva
--      por el portal está registrado por definición.
--   2. El alumno necesita una cuenta de verdad: entrar, ver sus datos y
--      corregir su correo. fn_wellness_me devuelve el perfil completo y
--      fn_wellness_update_me deja completar el correo, que es lo que hará
--      falta para las membresías.
--   3. El cierre de turno ya no puede usar UN precio: los registrados pagan
--      uno y los walk-ins otro. wellness_sessions gana precio_walkin y los
--      ingresos se recalculan con los dos.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Requiere wellness.sql, wellness_operacion.sql y wellness_portal_identidad.sql.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1. Reservar cobra el precio vigente del venue ───────────────────────────
create or replace function public.fn_wellness_book(p_token uuid, p_slot uuid, p_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_student uuid; v_cap int; v_booked int; v_price numeric;
  v_weekday int; v_booking uuid; v_pct numeric; v_vigente numeric;
begin
  select id into v_student from wellness_students where access_token = p_token;
  if v_student is null then return jsonb_build_object('error', 'Tu acceso no es válido — entra de nuevo con tu teléfono.'); end if;

  -- El precio vigente del venue manda sobre el de la clase: así una promoción
  -- se define en UN lugar (Wellness → Configuración) y aplica a todo.
  select c.capacity, c.price, s.weekday, i.revenue_pct, cfg.precio_vigente
    into v_cap, v_price, v_weekday, v_pct, v_vigente
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

  if coalesce(v_vigente, 0) > 0 then v_price := v_vigente; end if;

  insert into wellness_bookings (slot_id, class_date, student_id, amount, instructor_pct)
  values (p_slot, p_date, v_student, v_price, v_pct)
  on conflict (slot_id, class_date, student_id) do update set status = 'reservada'
  returning id into v_booking;
  return jsonb_build_object('booking_id', v_booking, 'amount', v_price);
end $$;

-- ─── 2. La cuenta del alumno ─────────────────────────────────────────────────
-- Perfil completo + historial. Las clases tomadas y la fecha de alta son la
-- base de lo que viene: paquetes y membresías se cuentan contra esto.
create or replace function public.fn_wellness_me(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name',       st.full_name,
    'phone',      st.phone,
    'email',      st.email,
    'since',      st.created_at,
    'tomadas',    (select count(*) from wellness_bookings b where b.student_id = st.id and b.status = 'asistio'),
    'reservadas', (select count(*) from wellness_bookings b where b.student_id = st.id and b.status = 'reservada'),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'booking_id', b.id, 'class', c.name, 'class_date', b.class_date,
        'start_time', to_char(s.start_time, 'HH24:MI'), 'instructor', i.full_name,
        'status', b.status, 'paid', b.paid, 'amount', b.amount
      ) order by b.class_date desc)
      from wellness_bookings b
      join wellness_slots s on s.id = b.slot_id
      join wellness_classes c on c.id = s.class_id
      left join wellness_instructors i on i.id = c.instructor_id
      where b.student_id = st.id), '[]'::jsonb))
  from wellness_students st where st.access_token = p_token
$$;

-- Entrar con teléfono + nombre. Es el MISMO criterio que al registrarse: el
-- teléfono identifica y el primer nombre confirma, para que un número ajeno no
-- baste para entrar a la cuenta de alguien más. No es autenticación fuerte —
-- cuando haya dinero de membresías de por medio, esto pide un código por
-- WhatsApp; hoy protege lo que hay: el historial de clases.
create or replace function public.fn_wellness_login(p_phone text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_student wellness_students; v_tel text;
begin
  v_tel := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_tel) < 10 then
    return jsonb_build_object('error', 'Escribe tu teléfono a 10 dígitos.');
  end if;
  select * into v_student from wellness_students where phone = v_tel;
  if not found then
    return jsonb_build_object('nuevo', true);
  end if;
  if lower(split_part(trim(v_student.full_name), ' ', 1)) <> lower(split_part(trim(coalesce(p_name, '')), ' ', 1)) then
    return jsonb_build_object('error', 'Ese teléfono está registrado con otro nombre. Escríbenos si es tuyo.');
  end if;
  return jsonb_build_object('token', v_student.access_token, 'name', v_student.full_name, 'returning', true);
end $$;

-- El alumno completa o corrige su correo (el nombre y el teléfono no se tocan
-- solos: son su llave de acceso).
create or replace function public.fn_wellness_update_me(p_token uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_mail text;
begin
  v_mail := nullif(trim(coalesce(p_email, '')), '');
  if v_mail is not null and v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('error', 'Ese correo no se ve bien — revísalo.');
  end if;
  update wellness_students set email = v_mail where access_token = p_token;
  if not found then return jsonb_build_object('error', 'Tu acceso no es válido.'); end if;
  return jsonb_build_object('ok', true, 'email', v_mail);
end $$;

revoke all on function public.fn_wellness_login(text, text) from public;
revoke all on function public.fn_wellness_update_me(uuid, text) from public;
-- Los roles de Supabase existen en Supabase, no en un Postgres pelón: el
-- guard deja correr el archivo en cualquier base sin romperse en el grant.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.fn_wellness_login(text, text) to anon;
    grant execute on function public.fn_wellness_update_me(uuid, text) to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.fn_wellness_login(text, text) to authenticated;
    grant execute on function public.fn_wellness_update_me(uuid, text) to authenticated;
  end if;
end $$;

-- ─── 3. El cierre de turno cobra dos precios ─────────────────────────────────
-- Registrados al precio con descuento, walk-ins al regular. Con un solo precio
-- el ingreso del turno quedaba mal desde el día que entró la regla.
alter table wellness_sessions add column if not exists precio_walkin numeric check (precio_walkin is null or precio_walkin >= 0);

do $$ begin
  if exists (select 1 from information_schema.columns
              where table_name = 'wellness_sessions' and column_name = 'ingresos') then
    alter table wellness_sessions drop column ingresos;
  end if;
end $$;

-- Los registrados son los cobrados que no fueron walk-in. Si no se capturó
-- precio de walk-in, se usa el mismo — así una operación de un solo precio
-- sigue dando exactamente el mismo número que antes.
alter table wellness_sessions add column ingresos numeric
  generated always as (
    greatest(total_cobrados - walk_ins, 0) * precio_aplicado
    + walk_ins * coalesce(precio_walkin, precio_aplicado)
  ) stored;

notify pgrst, 'reload schema';
