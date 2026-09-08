-- ═════════════════════════════════════════════════════════════════════════════
-- WELLNESS · TICKET CON CÓDIGO DE COMPRA
--
-- El portal pasa a ser un link público de redes: alguien lo abre, se registra y
-- reserva. En caja necesitan poder identificar esa reserva sin buscar por
-- nombre —hay homónimos, y el teléfono no se dicta bien de lejos—, así que cada
-- reserva gana un CÓDIGO corto que el alumno enseña.
--
-- FORMA DEL CÓDIGO: POD-XXXXX sobre un alfabeto de 32 caracteres SIN los
-- ambiguos (nada de 0/O ni 1/I/L). Se dicta por teléfono y se teclea sin error,
-- que es justo lo que va a pasar en la caja del primer piso.
--
-- VA EN TRIGGER, no dentro de fn_wellness_book: así toda reserva tiene código
-- venga de donde venga —el portal, el panel de Wellness, una carga manual— y no
-- hay un camino que deje reservas sin identificar.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Requiere wellness.sql y wellness_alumnos.sql.
-- ═════════════════════════════════════════════════════════════════════════════

alter table wellness_bookings add column if not exists code text;

-- Único, pero tolerando NULL: una fila a medio crear no debe tumbar el insert.
create unique index if not exists wellness_bookings_code_uk on wellness_bookings (code);

create or replace function public.fn_wellness_gen_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  -- 32 caracteres, sin 0/O/1/I/L: 32^5 = 33.5 millones de combinaciones.
  v_alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text;
  i int;
begin
  for _intento in 1..20 loop
    v_code := 'POD-';
    for i in 1..5 loop
      v_code := v_code || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
    end loop;
    if not exists (select 1 from wellness_bookings b where b.code = v_code) then
      return v_code;
    end if;
  end loop;
  -- Veinte choques seguidos con 33 millones de combinaciones no pasa por azar.
  -- Si pasa, algo está roto y es mejor fallar que entregar un código repetido
  -- que en caja cobraría la clase de otra persona.
  raise exception 'No se pudo generar un código de reserva único después de 20 intentos';
end $$;

create or replace function public.fn_wellness_set_booking_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.code is null then
    new.code := public.fn_wellness_gen_code();
  end if;
  return new;
end $$;

drop trigger if exists trg_wellness_booking_code on wellness_bookings;
create trigger trg_wellness_booking_code
  before insert on wellness_bookings
  for each row execute function public.fn_wellness_set_booking_code();

-- Las reservas que ya existían también necesitan código: si no, la primera
-- persona que llegue a caja con una reserva vieja no tiene qué enseñar.
update wellness_bookings set code = public.fn_wellness_gen_code() where code is null;

-- ─── El código viaja al alumno ───────────────────────────────────────────────
-- fn_wellness_book lo devuelve al reservar (para pintar el ticket en el acto) y
-- fn_wellness_me lo trae en cada reserva (para volver a verlo después).

create or replace function public.fn_wellness_book(p_token uuid, p_slot uuid, p_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_student uuid; v_cap int; v_booked int; v_price numeric;
  v_weekday int; v_booking uuid; v_pct numeric; v_vigente numeric; v_code text;
begin
  select id into v_student from wellness_students where access_token = p_token;
  if v_student is null then return jsonb_build_object('error', 'Tu acceso no es válido — entra de nuevo con tu teléfono.'); end if;

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
  returning id, code into v_booking, v_code;

  return jsonb_build_object('booking_id', v_booking, 'amount', v_price, 'code', v_code);
end $$;

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
$$;

-- fn_wellness_gen_code no se expone: nadie de fuera debe poder quemar códigos.
revoke all on function public.fn_wellness_gen_code() from public;

notify pgrst, 'reload schema';
