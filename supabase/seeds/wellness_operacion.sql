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
