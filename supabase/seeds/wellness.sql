-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · WELLNESS — clases, alumnos, reservas y cobros
--
-- Tres audiencias sobre los mismos datos:
--  · ALUMNO (público, sin cuenta HOG APP): ve horarios, se registra una vez,
--    aparta su lugar y paga. Su "login" es un token personal — como ?mireserva=.
--  · INSTRUCTOR (cuenta HOG APP, app 'wellness'): ve cuántos alumnos hay por
--    horario en SUS clases. Nada más.
--  · GERENTE WELLNESS (app 'wellness' + capability 'wellness_admin', o Master):
--    administra clases/horarios/precios, ve ingresos y toda la base de alumnos.
--
-- El dinero: cada reserva puede pagarse por Blumon Pay (checkout link, vía la
-- edge function wellness-pay) o marcarse pagada a mano (efectivo/transferencia).
-- wellness_payments es el espejo auditable de lo que respondió Blumon.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Permisos ─────────────────────────────────────────────────────────────────
create or replace function public.fn_can_wellness()
returns boolean language sql stable security definer set search_path = public as $$
  select hog_role() = 'MASTER'
      or exists (select 1 from user_apps where user_id = auth.uid() and app = 'wellness')
$$;

-- Gerente wellness: administra catálogo, precios, alumnos e ingresos.
-- El instructor tiene la app pero NO esta capability — solo lee su reporte.
create or replace function public.fn_wellness_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select hog_role() = 'MASTER'
      or exists (select 1 from user_capabilities
                 where user_id = auth.uid() and capability = 'wellness_admin')
$$;

revoke all on function public.fn_can_wellness() from public;
revoke all on function public.fn_wellness_admin() from public;
grant execute on function public.fn_can_wellness() to authenticated;
grant execute on function public.fn_wellness_admin() to authenticated;

-- ── Instructores ─────────────────────────────────────────────────────────────
-- profile_id liga al login de HOG APP cuando el instructor tiene cuenta: así
-- Rafa entra con el MISMO sistema de login y solo ve sus clases.
create table if not exists public.wellness_instructors (
  id         uuid primary key default gen_random_uuid(),
  bu_id      uuid not null references business_units(id) on delete cascade,
  full_name  text not null,
  phone      text,
  email      text,
  profile_id uuid unique references profiles(id) on delete set null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Clases (catálogo) ────────────────────────────────────────────────────────
create table if not exists public.wellness_classes (
  id            uuid primary key default gen_random_uuid(),
  bu_id         uuid not null references business_units(id) on delete cascade,
  name          text not null,
  description   text,
  instructor_id uuid references wellness_instructors(id) on delete set null,
  price         numeric not null default 0 check (price >= 0),   -- por clase suelta
  capacity      int not null default 12 check (capacity > 0),
  duration_min  int not null default 60,
  color         text not null default '#5FBF7A',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ── Horarios recurrentes ─────────────────────────────────────────────────────
-- weekday: 0=domingo … 6=sábado (getDay() de JS, para no traducir nada)
create table if not exists public.wellness_slots (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references wellness_classes(id) on delete cascade,
  weekday    int not null check (weekday between 0 and 6),
  start_time time not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (class_id, weekday, start_time)
);

-- ── Alumnos (base pública — SIN cuenta de Supabase) ──────────────────────────
-- Su login es el access_token: se registra una vez, guarda su link y con eso
-- reserva, ve sus clases y paga. Fricción cero, cero contraseñas que olvidar.
create table if not exists public.wellness_students (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  phone        text not null,
  email        text,
  access_token uuid not null unique default gen_random_uuid(),
  notes        text,
  created_at   timestamptz not null default now()
);
create unique index if not exists idx_wellness_students_phone on wellness_students (phone);

-- ── Reservas ─────────────────────────────────────────────────────────────────
-- La ocurrencia concreta es (slot, fecha): "Dharma Yoga del martes 19 ago".
create table if not exists public.wellness_bookings (
  id          uuid primary key default gen_random_uuid(),
  slot_id     uuid not null references wellness_slots(id) on delete cascade,
  class_date  date not null,
  student_id  uuid not null references wellness_students(id) on delete cascade,
  status      text not null default 'reservada'
              check (status in ('reservada', 'asistio', 'no_show', 'cancelada')),
  paid        boolean not null default false,
  paid_via    text,                 -- blumon · efectivo · transferencia · cortesia
  amount      numeric,              -- precio al momento de reservar (la historia no cambia)
  payment_id  uuid,
  created_at  timestamptz not null default now(),
  unique (slot_id, class_date, student_id)
);
create index if not exists idx_wellness_bookings_date on wellness_bookings (class_date desc);

-- ── Pagos (espejo Blumon + manuales) ─────────────────────────────────────────
create table if not exists public.wellness_payments (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid references wellness_students(id) on delete set null,
  booking_id       uuid references wellness_bookings(id) on delete set null,
  amount           numeric not null,
  method           text not null default 'blumon',
  status           text not null default 'pendiente'
                   check (status in ('pendiente', 'pagado', 'rechazado', 'cancelado')),
  blumon_reference text,            -- reference del checkout / webhook
  blumon_operation text,            -- operationNumber
  blumon_auth      text,            -- authorizationCode
  detail           jsonb,           -- respuesta cruda del webhook, para auditar
  created_at       timestamptz not null default now(),
  paid_at          timestamptz
);
create index if not exists idx_wellness_payments_ref on wellness_payments (blumon_reference);

-- ── RLS (lado HOG APP) ───────────────────────────────────────────────────────
alter table wellness_instructors enable row level security;
alter table wellness_classes     enable row level security;
alter table wellness_slots       enable row level security;
alter table wellness_students    enable row level security;
alter table wellness_bookings    enable row level security;
alter table wellness_payments    enable row level security;

-- Leer: cualquiera con la app (el instructor necesita ver horarios y reservas
-- para su reporte). Escribir: solo gerentes/Master.
do $$ declare t text; begin
  foreach t in array array['wellness_instructors','wellness_classes','wellness_slots',
                           'wellness_students','wellness_bookings','wellness_payments'] loop
    execute format('drop policy if exists %I_sel on %I', t, t);
    execute format('create policy %I_sel on %I for select to authenticated using (fn_can_wellness())', t, t);
    execute format('drop policy if exists %I_wr on %I', t, t);
    execute format('create policy %I_wr on %I for all to authenticated using (fn_wellness_admin()) with check (fn_wellness_admin())', t, t);
  end loop;
end $$;

-- ── RPCs PÚBLICOS (el portal del alumno, vía anon) ───────────────────────────
-- Mismo patrón que fn_shared_task: security definer, ejecutables por anon,
-- devuelven SOLO lo que el portal necesita. Un alumno jamás ve a otro alumno.

-- El horario público del venue, con lugares disponibles de los próximos 14 días
create or replace function public.fn_wellness_schedule(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slot_id', s.id, 'weekday', s.weekday, 'start_time', to_char(s.start_time, 'HH24:MI'),
    'class', c.name, 'description', c.description, 'price', c.price,
    'capacity', c.capacity, 'duration_min', c.duration_min, 'color', c.color,
    'instructor', i.full_name
  ) order by s.weekday, s.start_time), '[]'::jsonb)
  from wellness_slots s
  join wellness_classes c on c.id = s.class_id and c.active
  join business_units b on b.id = c.bu_id and lower(b.code) = lower(p_code)
  left join wellness_instructors i on i.id = c.instructor_id
  where s.active
$$;

-- Cupo de una ocurrencia (para pintar "quedan 3 lugares")
create or replace function public.fn_wellness_occupancy(p_code text, p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slot_id', x.slot_id, 'class_date', x.class_date, 'booked', x.booked)), '[]'::jsonb)
  from (
    select b.slot_id, b.class_date, count(*) as booked
    from wellness_bookings b
    join wellness_slots s on s.id = b.slot_id
    join wellness_classes c on c.id = s.class_id
    join business_units bu on bu.id = c.bu_id and lower(bu.code) = lower(p_code)
    where b.class_date between p_from and p_to and b.status <> 'cancelada'
    group by b.slot_id, b.class_date
  ) x
$$;

-- Registro del alumno. Si el teléfono ya existe, devuelve SU token (el "login
-- fácil": vuelves a poner tu teléfono y nombre, y recuperas tu acceso).
create or replace function public.fn_wellness_register(p_name text, p_phone text, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_student wellness_students;
begin
  if length(trim(coalesce(p_name, ''))) < 3 or length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 10 then
    return jsonb_build_object('error', 'Nombre y teléfono (10 dígitos) son obligatorios.');
  end if;
  select * into v_student from wellness_students
   where phone = regexp_replace(p_phone, '\D', '', 'g');
  if found then
    -- El nombre debe coincidir a grandes rasgos — que no baste un teléfono
    -- ajeno para secuestrar la cuenta de otra persona
    if lower(split_part(trim(v_student.full_name), ' ', 1)) <> lower(split_part(trim(p_name), ' ', 1)) then
      return jsonb_build_object('error', 'Ese teléfono ya está registrado con otro nombre. Escríbenos si es tuyo.');
    end if;
    return jsonb_build_object('token', v_student.access_token, 'name', v_student.full_name, 'returning', true);
  end if;
  insert into wellness_students (full_name, phone, email)
  values (trim(p_name), regexp_replace(p_phone, '\D', '', 'g'), nullif(trim(coalesce(p_email, '')), ''))
  returning * into v_student;
  return jsonb_build_object('token', v_student.access_token, 'name', v_student.full_name, 'returning', false);
end $$;

-- Reservar: valida cupo DENTRO de la función (el cliente no decide si cabe)
create or replace function public.fn_wellness_book(p_token uuid, p_slot uuid, p_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_student uuid; v_cap int; v_booked int; v_price numeric; v_weekday int; v_booking uuid;
begin
  select id into v_student from wellness_students where access_token = p_token;
  if v_student is null then return jsonb_build_object('error', 'Tu acceso no es válido — regístrate de nuevo.'); end if;
  select c.capacity, c.price, s.weekday into v_cap, v_price, v_weekday
    from wellness_slots s join wellness_classes c on c.id = s.class_id
   where s.id = p_slot and s.active and c.active;
  if v_cap is null then return jsonb_build_object('error', 'Esa clase ya no está disponible.'); end if;
  if extract(dow from p_date)::int <> v_weekday or p_date < current_date then
    return jsonb_build_object('error', 'Fecha inválida para ese horario.');
  end if;
  select count(*) into v_booked from wellness_bookings
   where slot_id = p_slot and class_date = p_date and status <> 'cancelada';
  if v_booked >= v_cap then return jsonb_build_object('error', 'Esa clase ya está llena.'); end if;
  insert into wellness_bookings (slot_id, class_date, student_id, amount)
  values (p_slot, p_date, v_student, v_price)
  on conflict (slot_id, class_date, student_id) do update set status = 'reservada'
  returning id into v_booking;
  return jsonb_build_object('booking_id', v_booking, 'amount', v_price);
end $$;

-- Mis clases: lo que el alumno ve con su token
create or replace function public.fn_wellness_me(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', st.full_name,
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

-- Cancelar (el alumno, hasta 3 horas antes; después ya cuenta como lugar tomado)
create or replace function public.fn_wellness_cancel(p_token uuid, p_booking uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ok int;
begin
  update wellness_bookings b set status = 'cancelada'
  from wellness_students st, wellness_slots s
  where b.id = p_booking and st.access_token = p_token and b.student_id = st.id
    and s.id = b.slot_id
    and (b.class_date + s.start_time) > now() + interval '3 hours';
  get diagnostics v_ok = row_count;
  return case when v_ok > 0 then jsonb_build_object('ok', true)
         else jsonb_build_object('error', 'Ya no se puede cancelar esta clase (menos de 3 horas).') end;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'fn_wellness_schedule(text)', 'fn_wellness_occupancy(text, date, date)',
    'fn_wellness_register(text, text, text)', 'fn_wellness_book(uuid, uuid, date)',
    'fn_wellness_me(uuid)', 'fn_wellness_cancel(uuid, uuid)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

-- ── ARRANQUE: Dharma Yoga con Rafa ───────────────────────────────────────────
-- Martes y jueves 7:30, sábado 11:00. AJUSTA el código de venue ('PC') y el
-- precio antes de correr si hace falta. No duplica si ya existe.
do $$
declare v_bu uuid; v_rafa uuid; v_clase uuid;
begin
  select id into v_bu from business_units where code = 'PC';   -- ⟵ tu venue wellness
  if v_bu is null then raise notice 'Venue PC no existe — ajusta el código y recorre este bloque'; return; end if;

  select id into v_rafa from wellness_instructors where bu_id = v_bu and full_name = 'Rafa';
  if v_rafa is null then
    insert into wellness_instructors (bu_id, full_name) values (v_bu, 'Rafa') returning id into v_rafa;
  end if;

  select id into v_clase from wellness_classes where bu_id = v_bu and name = 'Dharma Yoga';
  if v_clase is null then
    insert into wellness_classes (bu_id, name, description, instructor_id, price, capacity, duration_min, color)
    values (v_bu, 'Dharma Yoga',
            'Práctica de Dharma Yoga con Rafa — todos los niveles.',
            v_rafa, 250, 12, 60, '#5FBF7A')
    returning id into v_clase;
  end if;

  insert into wellness_slots (class_id, weekday, start_time) values
    (v_clase, 2, '07:30'),   -- martes
    (v_clase, 4, '07:30'),   -- jueves
    (v_clase, 6, '11:00')    -- sábado
  on conflict (class_id, weekday, start_time) do nothing;
end $$;

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- ACCESOS (después de correr esto):
--  · Instructor (Rafa): invítalo a HOG APP normal, en Usuarios dale la app
--    'wellness'. Luego liga su cuenta:
--      update wellness_instructors set profile_id =
--        (select id from profiles where email = 'CORREO-DE-RAFA')
--      where full_name = 'Rafa';
--  · Gerente wellness: app 'wellness' + en user_capabilities:
--      insert into user_capabilities (user_id, capability)
--      values ((select id from profiles where email = 'CORREO-GERENTE'), 'wellness_admin');
--  · Portal público: https://TU-DOMINIO/?wellness=PC
-- ─────────────────────────────────────────────────────────────────────────────
