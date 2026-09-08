-- ═════════════════════════════════════════════════════════════════════════════
-- POD WELLNESS · TODO EL SQL PENDIENTE, EN ORDEN
--
-- Pégalo completo en el SQL Editor de Supabase y córrelo de una vez.
-- Los cuatro bloques dependen entre sí, por eso van en este orden.
--
-- TODO ES IDEMPOTENTE: si ya corriste alguno, no pasa nada — las tablas usan
-- "if not exists", las columnas "add column if not exists" y las funciones
-- "create or replace". Probado dos veces seguidas contra PostgreSQL 16.
--
-- SI DA "connection timeout": el editor de Supabase corta pegadas grandes, y
-- el bloque 3 pide un lock exclusivo sobre wellness_sessions para recrear la
-- columna calculada de ingresos. Córrelos por separado desde supabase/seeds/,
-- en este mismo orden. El bloque 3 falla en 5 segundos con mensaje claro si
-- otra sesión tiene la tabla ocupada, en vez de quedarse esperando.
--
-- Contenido:
--   1. Parrilla, cierre de turno, tablero, maestros y configuración
--   2. Precio vigente hacia el portal público
--   3. Cuenta de alumno y precio por registro
--   4. Maestros y horarios reales de POD Wellness (casa NUEVOLEON108)
-- ═════════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  1/4 · PARRILLA · CIERRE DE TURNO · TABLERO · MAESTROS · CONFIGURACIÓN   ║
-- ║  wellness_operacion.sql                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═════════════════════════════════════════════════════════════════════════════
-- WELLNESS · OPERACIÓN — lo que el panel de Excel de POD Wellness administra
-- a mano, dentro de HOG APP.
--
-- El Excel tiene siete pestañas; esto cubre las cinco que se CAPTURAN:
--
--   PARRILLA        → wellness_slots gana turno, responsable de piso,
--                     instructor por horario, cupo, duración, estatus y notas.
--                     Deja de ser "activo sí/no" y pasa a ser la parrilla real.
--   REGISTRO DIARIO → wellness_sessions (NUEVO). El cierre de turno: cuántos se
--                     registraron por link, cuántos asistieron, cuántos walk-in
--                     se cobraron, a qué precio, si el instructor llegó a
--                     tiempo, si el espacio quedó limpio, y las incidencias.
--                     Es la bitácora que hoy llenan David (AM) y Valeria (PM).
--   MAESTROS        → wellness_instructors gana estatus, honorario fijo y notas,
--                     más qué clases imparte cada quien.
--   CONFIGURACIÓN   → wellness_config: precio regular, descuento de apertura,
--                     precio vigente (calculado) y meta de ingresos del mes.
--   TABLERO         → no se guarda: se deriva de wellness_sessions en la app,
--                     igual que la salud del proyecto en Project Manager. Un
--                     número que alguien tiene que actualizar se vuelve mentira.
--
-- VISTA SEMANAL y LISTAS no necesitan tablas: la primera es una lectura de la
-- parrilla y la segunda son los catálogos que ya viven en la base.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente. Requiere wellness.sql.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1. PARRILLA: el horario deja de ser solo "día y hora" ───────────────────
alter table wellness_slots add column if not exists turno          text;
alter table wellness_slots add column if not exists responsable_id uuid references profiles(id) on delete set null;
alter table wellness_slots add column if not exists instructor_id  uuid references wellness_instructors(id) on delete set null;
-- Cupo y duración POR HORARIO: el mismo Hatha Yoga puede ser de 60 min entre
-- semana y de 90 el sábado. null = hereda lo de la clase.
alter table wellness_slots add column if not exists capacity       int check (capacity is null or capacity > 0);
alter table wellness_slots add column if not exists duration_min   int check (duration_min is null or duration_min > 0);
alter table wellness_slots add column if not exists estatus        text not null default 'activa';
alter table wellness_slots add column if not exists notas          text;

alter table wellness_slots drop constraint if exists wellness_slots_estatus_check;
alter table wellness_slots add constraint wellness_slots_estatus_check
  check (estatus in ('activa', 'pausa', 'cancelada', 'propuesta'));

alter table wellness_slots drop constraint if exists wellness_slots_turno_check;
alter table wellness_slots add constraint wellness_slots_turno_check
  check (turno is null or turno in ('AM', 'PM', 'SAB'));

-- El turno se deduce de la hora y el día cuando no se captura: antes de las
-- 13:00 es AM, después PM, y todo el sábado es su propio turno.
update wellness_slots set turno = case
  when weekday = 6 then 'SAB'
  when start_time < time '13:00' then 'AM'
  else 'PM' end
 where turno is null;

-- Los horarios que ya existían con active = false quedan "en pausa", no
-- "activa": el estatus tiene que contar la misma historia que el booleano.
update wellness_slots set estatus = 'pausa' where active = false and estatus = 'activa';

create index if not exists idx_wslots_turno on wellness_slots (turno, weekday, start_time);

-- ─── 2. MAESTROS: directorio con estatus y honorario ─────────────────────────
alter table wellness_instructors add column if not exists estatus   text not null default 'confirmado';
-- Dos formas de pagar conviven: % del ingreso (revenue_pct, ya existía) u
-- honorario FIJO por clase, que es como opera POD Wellness hoy.
alter table wellness_instructors add column if not exists honorario numeric check (honorario is null or honorario >= 0);
alter table wellness_instructors add column if not exists notas     text;

alter table wellness_instructors drop constraint if exists wellness_instructors_estatus_check;
alter table wellness_instructors add constraint wellness_instructors_estatus_check
  check (estatus in ('confirmado', 'en_proceso', 'prospecto', 'baja'));

-- Qué clases imparte cada maestro (la columna "Clases que imparte" del Excel).
-- Es N a N: un maestro da varias clases y una clase la pueden dar varios.
create table if not exists public.wellness_instructor_classes (
  instructor_id uuid not null references wellness_instructors(id) on delete cascade,
  class_id      uuid not null references wellness_classes(id) on delete cascade,
  primary key (instructor_id, class_id)
);

-- ─── 3. REGISTRO DIARIO: el cierre de cada turno ─────────────────────────────
-- Una fila por clase impartida. Nace de la parrilla, pero guarda su propia
-- copia del nombre y la hora: si mañana renombran la clase o cambian el
-- horario, la bitácora de agosto sigue diciendo lo que de verdad pasó.
create table if not exists public.wellness_sessions (
  id                  uuid primary key default gen_random_uuid(),
  bu_id               uuid not null references business_units(id) on delete cascade,
  -- null = clase extra que no estaba en la parrilla (un taller, una sustitución)
  slot_id             uuid references wellness_slots(id) on delete set null,
  class_date          date not null,
  start_time          time not null,
  class_name          text not null,
  turno               text not null default 'AM' check (turno in ('AM', 'PM', 'SAB')),
  responsable_id      uuid references profiles(id) on delete set null,
  instructor_id       uuid references wellness_instructors(id) on delete set null,

  -- Los cuatro números del turno
  registrados_link    int not null default 0 check (registrados_link >= 0),
  asistieron          int not null default 0 check (asistieron >= 0),
  walk_ins            int not null default 0 check (walk_ins >= 0),
  total_cobrados      int not null default 0 check (total_cobrados >= 0),
  precio_aplicado     numeric not null default 0 check (precio_aplicado >= 0),
  -- Se calcula sola, como la celda gris del Excel: nadie la escribe y nadie
  -- la puede desfasar.
  ingresos            numeric generated always as (total_cobrados * precio_aplicado) stored,

  -- El checklist de cierre — lo que hace que el turno esté "bien cerrado"
  instructor_a_tiempo boolean,
  espacio_ok          boolean,
  incidencias         text,

  cerrado_por         uuid references profiles(id) on delete set null,
  cerrado_at          timestamptz,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Un solo cierre por horario y día. slot_id nulo no choca (varios NULL son
-- distintos entre sí en Postgres), así las clases extra conviven sin tropezar.
create unique index if not exists idx_wsessions_slot_fecha
  on wellness_sessions (slot_id, class_date) where slot_id is not null;
create index if not exists idx_wsessions_fecha on wellness_sessions (bu_id, class_date desc);
create index if not exists idx_wsessions_abiertas on wellness_sessions (class_date) where cerrado_at is null;

do $$ begin
  create trigger trg_wsessions_touch before update on wellness_sessions
    for each row execute function touch_updated_at();
exception when duplicate_object then null; end $$;

-- ─── 4. CONFIGURACIÓN por venue ──────────────────────────────────────────────
create table if not exists public.wellness_config (
  bu_id          uuid primary key references business_units(id) on delete cascade,
  precio_regular numeric not null default 0 check (precio_regular >= 0),
  descuento      numeric not null default 0 check (descuento >= 0),
  -- "Precio vigente" del Excel: se calcula solo y nunca baja de cero
  precio_vigente numeric generated always as (greatest(precio_regular - descuento, 0)) stored,
  meta_mensual   numeric not null default 0 check (meta_mensual >= 0),
  updated_by     uuid references profiles(id) on delete set null,
  updated_at     timestamptz not null default now()
);

do $$ begin
  create trigger trg_wconfig_touch before update on wellness_config
    for each row execute function touch_updated_at();
exception when duplicate_object then null; end $$;

-- ─── 5. RLS — mismo criterio que el resto de wellness ────────────────────────
alter table wellness_sessions           enable row level security;
alter table wellness_config             enable row level security;
alter table wellness_instructor_classes enable row level security;

do $$ declare t text; begin
  foreach t in array array['wellness_sessions', 'wellness_config', 'wellness_instructor_classes'] loop
    execute format('drop policy if exists %I_sel on %I', t, t);
    execute format('create policy %I_sel on %I for select to authenticated using (fn_can_wellness())', t, t);
    execute format('drop policy if exists %I_wr on %I', t, t);
    execute format('create policy %I_wr on %I for all to authenticated using (fn_wellness_admin()) with check (fn_wellness_admin())', t, t);
  end loop;
end $$;

-- El cierre del turno lo llena el responsable de piso, que NO es admin: puede
-- crear y editar la bitácora de su venue, pero no toca precios ni la parrilla.
drop policy if exists wellness_sessions_wr on wellness_sessions;
create policy wellness_sessions_wr on wellness_sessions for all to authenticated
  using (coalesce(fn_can_wellness(), false)) with check (coalesce(fn_can_wellness(), false));

notify pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  2/4 · PRECIO VIGENTE HACIA EL PORTAL PÚBLICO                            ║
-- ║  wellness_portal_identidad.sql                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═════════════════════════════════════════════════════════════════════════════
-- PORTAL WELLNESS · precio vigente hacia el alumno
--
-- El portal público mostraba el precio de cada clase (wellness_classes.price)
-- sin saber nada de la promoción. Con wellness_operacion.sql el precio vive en
-- wellness_config: precio regular, descuento vigente y precio resultante.
--
-- Este RPC lo expone al portal (anon, security definer, igual que el resto de
-- fn_wellness_*): devuelve SOLO lo que el alumno necesita ver — el nombre de
-- la casa y el precio con su promoción. Nada de metas ni de operación.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Requiere wellness.sql y wellness_operacion.sql.
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_wellness_info(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'venue',          b.name,
    'code',           b.code,
    -- Sin fila en wellness_config no hay promoción que anunciar: el portal
    -- entonces muestra el precio de cada clase, como siempre.
    'precio_regular', c.precio_regular,
    'descuento',      c.descuento,
    'precio_vigente', c.precio_vigente,
    'promocion',      coalesce(c.descuento, 0) > 0
  )
  from business_units b
  left join wellness_config c on c.bu_id = b.id
  where lower(b.code) = lower(p_code)
  limit 1
$$;

revoke all on function public.fn_wellness_info(text) from public;
grant execute on function public.fn_wellness_info(text) to anon, authenticated;

notify pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  3/4 · CUENTA DE ALUMNO Y PRECIO POR REGISTRO                            ║
-- ║  wellness_alumnos.sql                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

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
--
-- OJO: recrear una columna generada pide un ACCESS EXCLUSIVE sobre la tabla.
-- Si otra sesión la tiene tomada (por ejemplo, una corrida anterior que se
-- cortó y dejó una transacción abierta), esto se quedaría esperando hasta que
-- la conexión muera — que es justo el "connection timeout" que no dice nada.
-- Con lock_timeout falla en 5 segundos y con un mensaje que sí sirve.
set lock_timeout = '5s';

do $$
begin
  alter table wellness_sessions add column if not exists precio_walkin numeric
    check (precio_walkin is null or precio_walkin >= 0);

  -- Solo se recrea si todavía tiene la fórmula vieja: en la segunda corrida
  -- no toca nada y ni siquiera pide el lock.
  if exists (
    select 1 from pg_attrdef d
      join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     where d.adrelid = 'wellness_sessions'::regclass and a.attname = 'ingresos'
       and pg_get_expr(d.adbin, d.adrelid) not like '%walk_ins%'
  ) or not exists (
    select 1 from information_schema.columns
     where table_name = 'wellness_sessions' and column_name = 'ingresos'
  ) then
    if exists (select 1 from information_schema.columns
                where table_name = 'wellness_sessions' and column_name = 'ingresos') then
      alter table wellness_sessions drop column ingresos;
    end if;
    -- Los registrados son los cobrados que no fueron walk-in. Sin precio de
    -- walk-in se usa el mismo, así una operación de un solo precio sigue
    -- dando exactamente el mismo número que antes.
    alter table wellness_sessions add column ingresos numeric
      generated always as (
        greatest(total_cobrados - walk_ins, 0) * precio_aplicado
        + walk_ins * coalesce(precio_walkin, precio_aplicado)
      ) stored;
  end if;
exception when lock_not_available then
  raise exception 'No se pudo tomar el lock de wellness_sessions: otra sesión la tiene ocupada. Corre el diagnóstico de bloqueos, termina esa sesión y vuelve a intentar.';
end $$;

reset lock_timeout;

notify pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  4/4 · MAESTROS Y HORARIOS REALES DE POD WELLNESS                        ║
-- ║  wellness_parrilla_pod.sql                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═════════════════════════════════════════════════════════════════════════════
-- POD WELLNESS · MAESTROS Y PARRILLA REALES
--
-- Da de alta a los cinco maestros, las ocho clases y los quince horarios que
-- opera POD Wellness hoy. Sin esto la app está vacía y el portal público no
-- tiene nada que mostrar.
--
-- El venue va fijado abajo en v_code. Si el código no existe, el script se
-- detiene y te lista los que sí hay, en vez de crear las clases colgando de
-- la casa equivocada.
--
-- Es idempotente: correrlo dos veces no duplica nada. Si ya editaste un
-- horario a mano, la segunda corrida respeta lo que hay (usa on conflict).
--
-- Requiere wellness.sql y wellness_operacion.sql.
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  -- La casa de POD Wellness en HOG APP
  v_code   text := 'NUEVOLEON108';
  -- wellness.sql sembró un Dharma Yoga de ejemplo en martes y jueves 07:30.
  -- Con esto en true, cualquier horario de estas clases que NO esté en la
  -- parrilla oficial queda EN PAUSA (no se borra: se reactiva desde
  -- Wellness → Parrilla si de verdad lo usas). Ponlo en false si prefieres
  -- que no se toque nada de lo que ya existe.
  v_pausar_sobrantes boolean := true;
  v_sobrantes text;
  v_bu     uuid;
  v_rafa   uuid; v_alma uuid; v_yanni uuid; v_salva uuid; v_shanti uuid;
  v_dharma uuid; v_runners uuid; v_hatha uuid; v_sculpt uuid;
  v_power  uuid; v_pisoP uuid; v_vinyasa uuid; v_yin uuid;
  v_precio numeric;
begin
  select id into v_bu from business_units where upper(code) = upper(v_code);
  if v_bu is null then
    raise exception 'No existe la casa con código "%". Cambia v_code arriba por el código real de POD Wellness. Códigos disponibles: %',
      v_code, (select string_agg(code, ', ' order by code) from business_units);
  end if;

  -- El precio de la clase sigue al precio vigente del venue si ya está
  -- configurado (300 con -40 = 260); si no, arranca en 300.
  select coalesce(precio_vigente, 300) into v_precio from wellness_config where bu_id = v_bu;
  v_precio := coalesce(v_precio, 300);

  -- ── Maestros ──────────────────────────────────────────────────────────────
  -- Se identifican por nombre dentro de la casa: correr esto dos veces no
  -- crea un segundo "Rafa".
  insert into wellness_instructors (bu_id, full_name, estatus, active)
  select v_bu, x.nombre, 'confirmado', true
    from (values ('Rafa'), ('Alma'), ('Yanni Mejía'), ('Salvador Petrola'), ('Shanti')) as x(nombre)
   where not exists (select 1 from wellness_instructors i where i.bu_id = v_bu and lower(i.full_name) = lower(x.nombre));

  select id into v_rafa   from wellness_instructors where bu_id = v_bu and full_name = 'Rafa';
  select id into v_alma   from wellness_instructors where bu_id = v_bu and full_name = 'Alma';
  select id into v_yanni  from wellness_instructors where bu_id = v_bu and full_name = 'Yanni Mejía';
  select id into v_salva  from wellness_instructors where bu_id = v_bu and full_name = 'Salvador Petrola';
  select id into v_shanti from wellness_instructors where bu_id = v_bu and full_name = 'Shanti';

  -- ── Clases ────────────────────────────────────────────────────────────────
  -- Todas son multinivel: va en la descripción, que es lo que ve el alumno.
  insert into wellness_classes (bu_id, name, description, instructor_id, price, capacity, duration_min, color, active)
  select v_bu, x.nombre, 'Multinivel', x.maestro, v_precio, 12, 60, '#1D9E75', true
    from (values
      ('Dharma Yoga',                v_rafa),
      ('Yoga para Runners 🌈',       v_rafa),
      ('Hatha Yoga',                 v_alma),
      ('Sculpt n Burn Pilates',      v_yanni),
      ('Power Yoga',                 v_salva),
      ('Pilates de piso',            v_salva),
      ('Vinyasa Yoga',               v_shanti),
      ('Yin Yoga',                   v_shanti)
    ) as x(nombre, maestro)
   where not exists (select 1 from wellness_classes c where c.bu_id = v_bu and lower(c.name) = lower(x.nombre));

  -- Si la clase ya existía sin maestro (o con otro), se le pone el de la
  -- parrilla real: es la fuente de verdad de quién imparte qué.
  update wellness_classes c set instructor_id = x.maestro
    from (values
      ('Dharma Yoga', v_rafa), ('Yoga para Runners 🌈', v_rafa), ('Hatha Yoga', v_alma),
      ('Sculpt n Burn Pilates', v_yanni), ('Power Yoga', v_salva), ('Pilates de piso', v_salva),
      ('Vinyasa Yoga', v_shanti), ('Yin Yoga', v_shanti)
    ) as x(nombre, maestro)
   where c.bu_id = v_bu and lower(c.name) = lower(x.nombre)
     and c.instructor_id is distinct from x.maestro;

  select id into v_dharma  from wellness_classes where bu_id = v_bu and name = 'Dharma Yoga';
  select id into v_runners from wellness_classes where bu_id = v_bu and name = 'Yoga para Runners 🌈';
  select id into v_hatha   from wellness_classes where bu_id = v_bu and name = 'Hatha Yoga';
  select id into v_sculpt  from wellness_classes where bu_id = v_bu and name = 'Sculpt n Burn Pilates';
  select id into v_power   from wellness_classes where bu_id = v_bu and name = 'Power Yoga';
  select id into v_pisoP   from wellness_classes where bu_id = v_bu and name = 'Pilates de piso';
  select id into v_vinyasa from wellness_classes where bu_id = v_bu and name = 'Vinyasa Yoga';
  select id into v_yin     from wellness_classes where bu_id = v_bu and name = 'Yin Yoga';

  -- ── Parrilla ──────────────────────────────────────────────────────────────
  -- weekday: 0 domingo … 6 sábado. El turno se deduce de la hora (antes de las
  -- 13:00 AM, después PM, sábado su propio turno), igual que en la app.
  insert into wellness_slots (class_id, weekday, start_time, instructor_id, turno, estatus, duration_min, notas, active)
  select x.clase, x.dia, x.hora, x.maestro,
         case when x.dia = 6 then 'SAB' when x.hora < time '13:00' then 'AM' else 'PM' end,
         'activa', 60, x.nota, true
    from (values
      -- Lunes
      (1, time '08:00', v_hatha,   v_alma,   'Arranca 2 de septiembre'),
      (1, time '18:00', v_pisoP,   v_salva,  'Arranca 7 de septiembre'),
      (1, time '19:30', v_yin,     v_shanti, 'Arranca 8 de septiembre'),
      -- Martes
      (2, time '07:00', v_power,   v_salva,  'Arranca 7 de septiembre'),
      (2, time '08:00', v_sculpt,  v_yanni,  null),
      (2, time '18:00', v_vinyasa, v_shanti, 'Arranca 8 de septiembre'),
      (2, time '19:30', v_dharma,  v_rafa,   null),
      -- Miércoles
      (3, time '08:00', v_hatha,   v_alma,   'Arranca 2 de septiembre'),
      (3, time '18:00', v_pisoP,   v_salva,  'Arranca 7 de septiembre'),
      (3, time '19:30', v_runners, v_rafa,   null),
      -- Jueves
      (4, time '07:00', v_power,   v_salva,  'Arranca 7 de septiembre'),
      (4, time '08:00', v_sculpt,  v_yanni,  null),
      (4, time '18:00', v_vinyasa, v_shanti, 'Arranca 8 de septiembre'),
      (4, time '19:30', v_dharma,  v_rafa,   null),
      -- Sábado
      (6, time '11:00', v_dharma,  v_rafa,   null)
    ) as x(dia, hora, clase, maestro, nota)
  -- do update, no do nothing: un horario que ya existía de una carga previa
  -- se completa con su maestro y su turno en vez de quedarse a medias.
  on conflict (class_id, weekday, start_time) do update set
    instructor_id = excluded.instructor_id,
    turno         = excluded.turno,
    estatus       = 'activa',
    active        = true,
    duration_min  = coalesce(wellness_slots.duration_min, excluded.duration_min),
    notas         = coalesce(wellness_slots.notas, excluded.notas);

  -- ── Lo que sobra de cargas anteriores ─────────────────────────────────────
  if v_pausar_sobrantes then
    with fuera as (
      update wellness_slots s set estatus = 'pausa', active = false
       from wellness_classes c
      where c.id = s.class_id and c.bu_id = v_bu
        and coalesce(s.estatus, 'activa') = 'activa'
        and not ((s.weekday, s.start_time) in (
          (1, time '08:00'), (1, time '18:00'), (1, time '19:30'),
          (2, time '07:00'), (2, time '08:00'), (2, time '18:00'), (2, time '19:30'),
          (3, time '08:00'), (3, time '18:00'), (3, time '19:30'),
          (4, time '07:00'), (4, time '08:00'), (4, time '18:00'), (4, time '19:30'),
          (6, time '11:00')))
      returning c.name, s.weekday, s.start_time)
    select string_agg(format('%s %s %s',
             case weekday when 0 then 'dom' when 1 then 'lun' when 2 then 'mar' when 3 then 'mié'
                          when 4 then 'jue' when 5 then 'vie' else 'sáb' end,
             to_char(start_time, 'HH24:MI'), name), ' · ')
      into v_sobrantes from fuera;
    if v_sobrantes is not null then
      raise notice 'Quedaron EN PAUSA (no en la parrilla oficial): %. Si alguno sí va, reactívalo en Wellness → Parrilla.', v_sobrantes;
    end if;
  end if;

  -- ── Qué imparte cada quien (el directorio de Maestros lo muestra) ─────────
  insert into wellness_instructor_classes (instructor_id, class_id)
  select c.instructor_id, c.id from wellness_classes c
   where c.bu_id = v_bu and c.instructor_id is not null
  on conflict do nothing;

  raise notice 'POD Wellness listo en % — % maestros, % clases, % horarios.',
    v_code,
    (select count(*) from wellness_instructors where bu_id = v_bu),
    (select count(*) from wellness_classes where bu_id = v_bu),
    (select count(*) from wellness_slots s join wellness_classes c on c.id = s.class_id where c.bu_id = v_bu);
end $$;

notify pgrst, 'reload schema';
