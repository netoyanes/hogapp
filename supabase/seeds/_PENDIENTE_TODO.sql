-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · SQL PENDIENTE ACUMULADO
-- Generado el 2026-08-18 — 7 migraciones en un solo archivo.
--
-- Pégalo completo en el SQL Editor de Supabase y córrelo de una vez.
--
-- TODO ES IDEMPOTENTE: si alguna de estas migraciones ya se había corrido, no
-- pasa nada — las tablas usan "if not exists", las columnas "add column if not
-- exists" y las funciones "create or replace". Probado dos veces seguidas
-- contra PostgreSQL 16: la segunda corrida da exactamente el mismo resultado.
--
-- NO incluye:
--   · pr_attribution.sql      (Red PR — se aplica aparte, cuando decidas)
--   · demo_hotel_kickoff.sql  (datos de demostración, no estructura)
--
-- Contenido, en orden:
--   1. activity_v2.sql                  Actividad v2 — índices y funciones de estadística del log
--   2. reclutamiento_confirmacion.sql   Reclutamiento + confirm_sent_at (la hora de envío del WhatsApp)
--   3. project_program.sql              Programa del proyecto — actividades con horario
--   4. project_budget_v2.sql            Presupuesto v2 — categorías, cantidades, cotizaciones y colaboradores
--   5. og_share.sql                     Open Graph por venue — título, descripción e imagen del link
--   6. landing_views.sql                Vistas del landing con geo + viewed_at de conversaciones
--   7. app_feedback.sql                 Reportes de falla y sugerencias desde cualquier ventana
-- ═════════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  0/7 · PREFLIGHT — columnas que la app da por hechas
-- ║
-- ║  tasks.archived se usa en toda la app (Tareas, Proyectos, los conteos de
-- ║  avance) pero no lo crea ningún archivo del repositorio: se agregó
-- ║  directamente sobre la base en algún momento. En producción ya existe y
-- ║  esta línea no hace nada; está aquí para que el repositorio pueda
-- ║  reconstruir la base desde cero sin quedar cojo.
-- ╚═══════════════════════════════════════════════════════════════════════════╝

alter table tasks add column if not exists archived boolean not null default false;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  1/7 · activity_v2.sql
-- ║  Actividad v2 — índices y funciones de estadística del log
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────────────────────────────────────
-- ACTIVIDAD v2 — medir el uso real de TODAS las áreas de HOG APP.
--
-- Hoy el visor trae 300 filas y cuenta en el navegador: "Total" es en realidad
-- el tope de la consulta y "Semana" miente si hubo más de 300 acciones. Aquí
-- se agrega del lado del servidor, sobre la tabla completa.
--
--   1. activity_log.bu_id — venue de la acción, para medir uso por unidad.
--      Se llena de aquí en adelante; lo histórico se rescata del JSON details
--      (donde algunas acciones ya guardaban el código del venue).
--   2. Índices para que las consultas por fecha/usuario/acción no escaneen todo.
--   3. fn_activity_stats  — uso por módulo, personas activas y tendencia.
--   4. fn_activity_heatmap — cuándo se usa la app (hora × día de la semana).
--   5. fn_activity_idle_users — quién NO la está usando.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

alter table activity_log add column if not exists bu_id uuid references business_units(id) on delete set null;

create index if not exists idx_activity_created  on activity_log (created_at desc);
create index if not exists idx_activity_user     on activity_log (user_id, created_at desc);
create index if not exists idx_activity_action   on activity_log (action, created_at desc);
create index if not exists idx_activity_bu       on activity_log (bu_id, created_at desc) where bu_id is not null;

-- Rescate histórico: varias acciones ya guardaban el CÓDIGO del venue dentro
-- de details (ej. {"bu": "OC"}). Se traduce a bu_id una sola vez.
update activity_log a
   set bu_id = b.id
  from business_units b
 where a.bu_id is null
   and a.details ? 'bu'
   and upper(a.details->>'bu') = b.code;

-- ── 1. Uso por módulo ───────────────────────────────────────────────────────
-- Devuelve, para el periodo pedido y el inmediatamente anterior de la misma
-- duración: acciones y personas distintas por acción. La app agrupa por módulo
-- con su catálogo (una sola fuente de verdad para los nombres, en el front).
create or replace function public.fn_activity_stats(p_desde timestamptz, p_hasta timestamptz)
returns table(action text, periodo text, acciones bigint, personas bigint)
language sql
security definer
set search_path = public
as $$
  with ventana as (
    select (p_hasta - p_desde) as dur
  )
  select a.action,
         case when a.created_at >= p_desde then 'actual' else 'previo' end as periodo,
         count(*)                       as acciones,
         count(distinct a.user_id)      as personas
  from activity_log a, ventana v
  where a.created_at >= p_desde - v.dur
    and a.created_at <  p_hasta
  group by 1, 2
$$;

-- ── 2. Uso por venue ────────────────────────────────────────────────────────
create or replace function public.fn_activity_by_venue(p_desde timestamptz, p_hasta timestamptz)
returns table(bu_code text, bu_name text, acciones bigint, personas bigint)
language sql
security definer
set search_path = public
as $$
  select b.code, b.name, count(*), count(distinct a.user_id)
  from activity_log a
  join business_units b on b.id = a.bu_id
  where a.created_at >= p_desde and a.created_at < p_hasta
  group by b.code, b.name
  order by count(*) desc
$$;

-- ── 3. Mapa de calor: cuándo se usa la app (hora local de México) ───────────
create or replace function public.fn_activity_heatmap(p_desde timestamptz, p_hasta timestamptz)
returns table(dow int, hora int, acciones bigint)
language sql
security definer
set search_path = public
as $$
  select extract(dow  from a.created_at at time zone 'America/Mexico_City')::int,
         extract(hour from a.created_at at time zone 'America/Mexico_City')::int,
         count(*)
  from activity_log a
  where a.created_at >= p_desde and a.created_at < p_hasta
  group by 1, 2
$$;

-- ── 4. Quién no está usando la app ──────────────────────────────────────────
-- Cada perfil con su última acción (o nunca). Ordenados por más olvidados.
-- No se filtra por "activo" porque profiles no lleva esa bandera: una cuenta
-- que nunca se usó también es información — o sobra, o alguien no entró nunca.
create or replace function public.fn_activity_idle_users(p_dias int default 14)
returns table(user_id uuid, nombre text, rol text, ultima timestamptz, dias_sin_usar int)
language sql
security definer
set search_path = public
as $$
  select p.id,
         coalesce(p.full_name, p.email, 'Sin nombre'),
         coalesce(p.role, '—'),
         max(a.created_at),
         case when max(a.created_at) is null then 9999
              else extract(day from now() - max(a.created_at))::int end
  from profiles p
  left join activity_log a on a.user_id = p.id
  group by p.id, p.full_name, p.email, p.role
  having max(a.created_at) is null
      or max(a.created_at) < now() - make_interval(days => p_dias)
  order by 5 desc
$$;

-- ── 5. Ficha de una persona ────────────────────────────────────────────────
-- Mezcla dos cosas distintas a propósito:
--   · lo que HIZO en el periodo (del registro de actividad), y
--   · lo que TIENE hoy (de las tablas vivas: asignaciones, seguimientos),
-- porque "cuántas tareas trae encima" no es una acción, es un estado.
create or replace function public.fn_activity_person(
  p_user uuid, p_desde timestamptz, p_hasta timestamptz
) returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'perfil', (select jsonb_build_object('nombre', coalesce(pf.full_name, pf.email), 'rol', pf.role, 'email', pf.email)
               from profiles pf where pf.id = p_user),

    -- HIZO — en el periodo
    'acciones_total', (select count(*) from activity_log a
                       where a.user_id = p_user and a.created_at >= p_desde and a.created_at < p_hasta),
    'por_accion', coalesce((
      select jsonb_object_agg(x.action, x.n) from (
        select a.action, count(*) n from activity_log a
        where a.user_id = p_user and a.created_at >= p_desde and a.created_at < p_hasta
        group by a.action
      ) x), '{}'::jsonb),
    'comentarios', (
      (select count(*) from task_comments  c where c.author_id = p_user and c.created_at >= p_desde and c.created_at < p_hasta)
    + (select count(*) from event_comments c where c.author_id = p_user and c.created_at >= p_desde and c.created_at < p_hasta)
    + (select count(*) from crm_activities c where c.created_by = p_user and c.created_at >= p_desde and c.created_at < p_hasta)),
    'reservas_creadas', (select count(*) from reservations r
                         where r.created_by = p_user and r.created_at >= p_desde and r.created_at < p_hasta),
    'compartio_tareas', (select count(*) from activity_log a
                         where a.user_id = p_user and a.action = 'task_shared'
                           and a.created_at >= p_desde and a.created_at < p_hasta),
    'vistas_de_lo_que_compartio', (select count(*) from activity_log a
      where a.action = 'task_viewed_externally' and a.created_at >= p_desde and a.created_at < p_hasta
        and a.entity_id in (select b.entity_id from activity_log b
                            where b.user_id = p_user and b.action = 'task_shared')),

    -- TIENE — estado actual, sin importar el periodo
    'tareas_responsable',        (select count(*) from tasks t where t.assigned_to = p_user and coalesce(t.archived,false) = false),
    'tareas_responsable_activas',(select count(*) from tasks t where t.assigned_to = p_user and coalesce(t.archived,false) = false and t.status <> 'APPROVED'),
    'tareas_vencidas',           (select count(*) from tasks t where t.assigned_to = p_user and coalesce(t.archived,false) = false
                                    and t.status <> 'APPROVED' and t.due_date < current_date),
    'tareas_relacionado',        (select count(*) from task_followers f join tasks t on t.id = f.task_id
                                  where f.user_id = p_user and coalesce(t.archived,false) = false and t.assigned_to is distinct from p_user),
    'proyectos_responsable',     (select count(*) from event_plans e where e.responsible = p_user
                                    and coalesce(e.archived,false) = false and e.status <> 'cancelled'),
    'ultima_accion', (select max(a.created_at) from activity_log a where a.user_id = p_user)
  )
$$;

-- ── 6. Almacenamiento en la nube ────────────────────────────────────────────
-- Cuánto pesan los archivos adjuntos (evidencias de tareas, comprobantes del
-- concierge, etc.). Lee storage.objects, que guarda el tamaño real en
-- metadata->>'size'. Sirve para vigilar el plan de Supabase antes de toparlo.
create or replace function public.fn_storage_usage()
returns table(bucket text, archivos bigint, bytes numeric, ultimo timestamptz)
language sql
security definer
set search_path = public, storage
as $$
  select o.bucket_id,
         count(*),
         coalesce(sum((o.metadata->>'size')::numeric), 0),
         max(o.created_at)
  from storage.objects o
  group by o.bucket_id
  order by 3 desc
$$;

-- Desglose del bucket más pesado por carpeta raíz (proofs/, concierge/…),
-- para saber QUÉ está ocupando el espacio, no solo cuánto.
create or replace function public.fn_storage_by_folder(p_bucket text)
returns table(carpeta text, archivos bigint, bytes numeric)
language sql
security definer
set search_path = public, storage
as $$
  select coalesce(split_part(o.name, '/', 1), '(raíz)'),
         count(*),
         coalesce(sum((o.metadata->>'size')::numeric), 0)
  from storage.objects o
  where o.bucket_id = p_bucket
  group by 1
  order by 3 desc
  limit 20
$$;

-- Solo quienes ya podían ver Actividad (Master, C-Level y DEV en auditoría).
revoke all on function public.fn_activity_stats(timestamptz, timestamptz) from public;
revoke all on function public.fn_activity_by_venue(timestamptz, timestamptz) from public;
revoke all on function public.fn_activity_heatmap(timestamptz, timestamptz) from public;
revoke all on function public.fn_activity_idle_users(int) from public;
revoke all on function public.fn_activity_person(uuid, timestamptz, timestamptz) from public;
revoke all on function public.fn_storage_usage() from public;
revoke all on function public.fn_storage_by_folder(text) from public;
grant execute on function public.fn_activity_stats(timestamptz, timestamptz) to authenticated;
grant execute on function public.fn_activity_by_venue(timestamptz, timestamptz) to authenticated;
grant execute on function public.fn_activity_heatmap(timestamptz, timestamptz) to authenticated;
grant execute on function public.fn_activity_idle_users(int) to authenticated;
grant execute on function public.fn_activity_person(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.fn_storage_usage() to authenticated;
grant execute on function public.fn_storage_by_folder(text) to authenticated;

notify pgrst, 'reload schema';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  2/7 · reclutamiento_confirmacion.sql
-- ║  Reclutamiento + confirm_sent_at (la hora de envío del WhatsApp)
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────────────────────────────────────
-- Reclutamiento (bolsa de trabajo, solo Master) + confirmación automática de
-- reservas por WhatsApp. Idempotente: se puede correr las veces que sea.
-- ─────────────────────────────────────────────────────────────────────────────

-- Bolsa de trabajo: candidatos que el Concierge registra cuando alguien
-- escribe buscando empleo (registrar_candidato), o dados de alta a mano.
create table if not exists job_candidates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  bu_id uuid references business_units(id) on delete set null,
  conversation_id uuid references bot_conversations(id) on delete set null,
  source text not null default 'concierge',              -- concierge | manual
  channel text,                                          -- whatsapp | instagram
  full_name text not null,
  phone text,
  ig_handle text,
  area text,                                             -- puesto/área de interés
  experience text,
  city text,
  links text,
  notes text,
  status text not null default 'nuevo'
    check (status in ('nuevo','contactado','entrevista','contratado','descartado'))
);

alter table job_candidates enable row level security;

-- Solo el Master ve y administra la bolsa (el edge function escribe con
-- service role, que brinca RLS).
drop policy if exists job_candidates_master on job_candidates;
create policy job_candidates_master on job_candidates for all
  using (hog_role() = 'MASTER') with check (hog_role() = 'MASTER');

-- Confirmación automática por WhatsApp: dedup — una reserva recibe UNA sola
-- confirmación automática (reservation-notify la marca aquí).
alter table reservations add column if not exists confirm_sent_at timestamptz;

-- Nombre de la plantilla aprobada en Meta (WhatsApp Manager). Cambiar el valor
-- si la plantilla se registra con otro nombre.
insert into app_settings (key, value) values ('wa_confirm_template', 'confirmacion_reserva')
on conflict (key) do nothing;

notify pgrst, 'reload schema';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  3/7 · project_program.sql
-- ║  Programa del proyecto — actividades con horario
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────────────────────────────────────
-- PROGRAMA DEL PROYECTO — la agenda de un evento que dura varios días.
--
-- Un proyecto ya tiene TAREAS (trabajo con fecha límite y responsable: "definir
-- costos antes del 14 de agosto"). Lo que faltaba es el PROGRAMA: lo que
-- SUCEDE durante el evento, con día y horario ("Yoga, miércoles 16, 10:30–12:00").
-- Son cosas distintas y por eso viven aparte:
--   · una tarea se COMPLETA — tiene assigned_to y un flujo de aprobación
--   · una actividad OCURRE — tiene hora de inicio y fin, lugar, quién la
--     imparte y a veces cupo; al final se marca si se hizo o se canceló
--
-- Cada actividad puede además generar sus propias tareas de preparación
-- (tasks.activity_id), para gestionarla individual sin perder el conjunto.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.project_activities (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references event_plans(id) on delete cascade,
  date         date not null,
  start_time   text,                       -- 'HH:MM' (24h)
  end_time     text,                       -- 'HH:MM'; puede cruzar medianoche
  title        text not null,
  description  text,
  location     text,                       -- sala, playa, terraza, dirección…
  facilitator  text,                       -- quién la imparte (puede ser externo)
  responsible  uuid references profiles(id) on delete set null,  -- del equipo
  capacity     int,                        -- cupo, si aplica
  cost         numeric,                    -- costo de esa actividad, si aplica
  status       text not null default 'planeada'
               check (status in ('planeada','confirmada','hecha','cancelada')),
  sort         int not null default 0,     -- orden dentro del mismo día/hora
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_pactivities_event on project_activities (event_id, date, start_time);

do $$ begin
  create trigger trg_pactivities_touch before update on project_activities
    for each row execute function touch_updated_at();
exception when duplicate_object then null; end $$;

-- Una tarea puede colgar de una actividad concreta (preparar el taller de
-- ostiones) además de colgar del proyecto — así se gestiona cada actividad
-- por separado sin sacarla del conjunto.
alter table tasks add column if not exists activity_id uuid references project_activities(id) on delete set null;
create index if not exists idx_tasks_activity on tasks (activity_id) where activity_id is not null;

alter table project_activities enable row level security;
drop policy if exists pactivities_select on project_activities;
create policy pactivities_select on project_activities for select to authenticated using (true);
drop policy if exists pactivities_write on project_activities;
create policy pactivities_write on project_activities for all to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM'))
  with check (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM'));

notify pgrst, 'reload schema';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  4/7 · project_budget_v2.sql
-- ║  Presupuesto v2 — categorías, cantidades, cotizaciones y colaboradores
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────────────────────────────────────
-- PRESUPUESTO UNIFICADO DEL PROYECTO
--
-- Antes había DOS secciones que en la práctica son lo mismo: "recursos
-- requeridos" (2 bartenders × $1,800) y "presupuesto por partidas" (renta de
-- sonido $35,000). Un bartender ES una partida de gasto — separarlas obligaba
-- a llevar la cuenta en dos lados y a sumarlas a mano para aprobar.
--
-- Ahora todo vive en project_budget_items, que gana lo que le faltaba:
--   · category  — tipo de gasto (personal, mobiliario, materiales, equipo…)
--   · area      — zona del proyecto (bar, restaurante, wellness, hotel…)
--   · qty/unit_cost — para partidas que se cuentan (2 bartenders, 8 macetas)
--   · quote_url — comprobante de cotización (imagen o PDF)
--   · responsible — quién se encarga de esa partida
-- project_resources se migra aquí y se conserva intacta por si acaso; la app
-- ya no la lee.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
alter table project_budget_items add column if not exists category    text not null default 'otro';
alter table project_budget_items add column if not exists area        text;
alter table project_budget_items add column if not exists qty         int not null default 1 check (qty > 0);
alter table project_budget_items add column if not exists unit_cost   numeric;
alter table project_budget_items add column if not exists quote_url   text;
alter table project_budget_items add column if not exists quote_type  text;
alter table project_budget_items add column if not exists responsible uuid references profiles(id) on delete set null;
alter table project_budget_items add column if not exists created_by  uuid;

do $$ begin
  alter table project_budget_items add constraint pbudget_category_check
    check (category in ('personal','mobiliario','materiales','equipo','servicios','marketing','operacion','otro'));
exception when duplicate_object then null; end $$;

-- Migración de los recursos existentes a partidas de gasto. Se marcan con
-- notes para poder distinguirlas si algo hay que revisar, y no se repite si
-- el script se corre dos veces.
insert into project_budget_items (event_id, concept, amount, is_income, category, qty, unit_cost, notes)
select r.event_id, r.name, coalesce(r.unit_cost, 0) * r.qty, false, 'personal', r.qty, r.unit_cost,
       coalesce(r.notes || ' · ', '') || 'migrado de recursos'
from project_resources r
where not exists (
  select 1 from project_budget_items b
  where b.event_id = r.event_id and b.concept = r.name and b.notes like '%migrado de recursos%'
);

-- ── Relacionados del proyecto: el equipo involucrado, además del responsable
create table if not exists public.project_collaborators (
  event_id   uuid not null references event_plans(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table project_collaborators enable row level security;
drop policy if exists pcollab_select on project_collaborators;
create policy pcollab_select on project_collaborators for select to authenticated using (true);
drop policy if exists pcollab_write on project_collaborators;
create policy pcollab_write on project_collaborators for all to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM'))
  with check (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM'));

-- ── Quién aprueba los presupuestos ──────────────────────────────────────────
-- Se reusa el mecanismo que ya existe (user_capabilities capability='aprobador'),
-- que es lo que lee canApprove en la app. La pantalla de Proyectos solo lo
-- administra; el Master siempre puede aprobar aunque no tenga la fila.
create table if not exists public.user_capabilities (
  user_id    uuid not null references profiles(id) on delete cascade,
  capability text not null,
  granted_by uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, capability)
);
alter table user_capabilities enable row level security;
drop policy if exists ucaps_select on user_capabilities;
create policy ucaps_select on user_capabilities for select to authenticated using (true);
drop policy if exists ucaps_write on user_capabilities;
create policy ucaps_write on user_capabilities for all to authenticated
  using (hog_role() = 'MASTER') with check (hog_role() = 'MASTER');

notify pgrst, 'reload schema';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  5/7 · og_share.sql
-- ║  Open Graph por venue — título, descripción e imagen del link
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ═════════════════════════════════════════════════════════════════════════════
-- PREVIEW DE COMPARTIR / PAUTA POR VENUE (Open Graph configurable)
--
-- Lo que Instagram/WhatsApp muestran al compartir /r/CODIGO — título,
-- descripción e imagen — se configura desde HOG APP (Reservas → Compartir),
-- no en código. Estas columnas son la fuente; la función serverless /r/ las
-- lee vía fn_og_meta.
--
-- fn_og_meta existe porque el robot de Meta llega como ANÓNIMO: en vez de
-- abrirle SELECT a business_units entera, la función le entrega SOLO los 4
-- campos del preview. Ejecutar en el SQL Editor. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════
alter table business_units add column if not exists og_title       text;
alter table business_units add column if not exists og_description text;
alter table business_units add column if not exists og_image_url   text;

create or replace function public.fn_og_meta(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', name, 'og_title', og_title,
    'og_description', og_description, 'og_image_url', og_image_url)
  from business_units where lower(code) = lower(p_code) limit 1
$$;
revoke all on function public.fn_og_meta(text) from public;
grant execute on function public.fn_og_meta(text) to anon, authenticated;

notify pgrst, 'reload schema';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  6/7 · landing_views.sql
-- ║  Vistas del landing con geo + viewed_at de conversaciones
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────────────────────────────────────
-- TRACKER DEL LANDING DE RESERVAS (?reservar=CODE) — cuántas personas ven el
-- link público de cada venue, y cuántas de esas terminan reservando.
--
--   · landing_views: una fila por vista. El navegador manda un session_id
--     persistente (localStorage), así "visitantes" = personas distintas y
--     "vistas" = aperturas totales; el refresh en la misma pestaña no duplica
--     (lo filtra el cliente con sessionStorage).
--   · El insert SOLO entra por fn_track_landing_view (security definer,
--     ejecutable por anon) — la tabla no tiene policy de insert directa.
--   · fn_landing_stats agrega por venue y cruza contra las reservas con
--     source='web' (las que nacen del propio landing) → conversión real.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.landing_views (
  id         uuid primary key default gen_random_uuid(),
  bu_id      uuid not null references business_units(id) on delete cascade,
  code       text not null,
  session_id text,                 -- visitante (uuid persistente del navegador)
  device     text,                 -- mobile | desktop
  referrer   text,                 -- de dónde llegó (IG, Google, directo…)
  viewed_at  timestamptz not null default now()
);
-- GEO (v2): país/región/ciudad del visitante. Lo llena la edge function
-- og-share con los headers x-vercel-ip-* que Vercel calcula al proxear /r/CODE
-- — gratis, sin servicios externos y sin tocar la privacidad más allá de la
-- ciudad. Los links viejos (?reservar= directo) no traen geo: por eso las
-- pautas y compartidos deben usar SIEMPRE /r/CODE.
alter table landing_views add column if not exists country text;
alter table landing_views add column if not exists region  text;
alter table landing_views add column if not exists city    text;
alter table landing_views add column if not exists via     text;   -- 'link' = entró por /r/

create index if not exists idx_lviews_bu   on landing_views (bu_id, viewed_at desc);
create index if not exists idx_lviews_time on landing_views (viewed_at desc);

alter table landing_views enable row level security;
drop policy if exists lviews_select on landing_views;
create policy lviews_select on landing_views for select to authenticated using (true);
-- (sin policy de insert: solo escribe la función)

-- Registra una vista del landing. Valida que el código exista — el resto de
-- parámetros se recortan para que nadie infle la tabla con basura larga.
create or replace function public.fn_track_landing_view(
  p_code text, p_session text default null, p_device text default null, p_referrer text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid;
begin
  select id into v_bu from business_units where code = upper(btrim(coalesce(p_code, '')));
  if v_bu is null then return; end if;  -- código inventado: no se guarda nada
  insert into landing_views (bu_id, code, session_id, device, referrer)
  values (v_bu, upper(btrim(p_code)), left(p_session, 64),
          case when p_device in ('mobile','desktop') then p_device else null end,
          left(p_referrer, 300));
end
$$;

revoke all on function public.fn_track_landing_view(text, text, text, text) from public;
grant execute on function public.fn_track_landing_view(text, text, text, text) to anon, authenticated;

-- Embudo por venue en un periodo: vistas, visitantes distintos, reservas que
-- nacieron del landing (source='web') y las confirmadas/sentadas/completadas.
create or replace function public.fn_landing_stats(p_desde timestamptz)
returns table(bu_code text, bu_name text, vistas bigint, visitantes bigint, reservas bigint, reservas_ok bigint)
language sql
security definer
set search_path = public
as $$
  select b.code, b.name,
         count(v.id),
         count(distinct coalesce(v.session_id, v.id::text)),
         (select count(*) from reservations r
           where r.bu_id = b.id and r.source = 'web' and r.created_at >= p_desde),
         (select count(*) from reservations r
           where r.bu_id = b.id and r.source = 'web' and r.created_at >= p_desde
             and r.status in ('confirmed','seated','completed'))
  from business_units b
  join landing_views v on v.bu_id = b.id and v.viewed_at >= p_desde
  group by b.id, b.code, b.name
  order by count(v.id) desc
$$;

revoke all on function public.fn_landing_stats(timestamptz) from public;
grant execute on function public.fn_landing_stats(timestamptz) to authenticated;

-- De dónde nos ven: top ciudades del periodo (para el Resumen del Concierge)
create or replace function public.fn_landing_geo(p_desde timestamptz)
returns table(country text, region text, city text, vistas bigint)
language sql security definer set search_path = public as $$
  select v.country, v.region, v.city, count(*)
  from landing_views v
  where v.viewed_at >= p_desde and v.country is not null
  group by v.country, v.region, v.city
  order by count(*) desc
  limit 12
$$;
revoke all on function public.fn_landing_geo(timestamptz) from public;
grant execute on function public.fn_landing_geo(timestamptz) to authenticated;

-- ── BANDEJA: marca de VISUALIZADO (para el cierre en bulk) ───────────────────
-- Se llena al abrir el hilo; una conversación cuenta como visualizada solo si
-- se abrió DESPUÉS de su último mensaje — si el cliente escribió de nuevo,
-- vuelve a ser "no vista" y no se puede cerrar en bulk sin abrirla.
alter table bot_conversations add column if not exists viewed_at timestamptz;

notify pgrst, 'reload schema';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  7/7 · app_feedback.sql
-- ║  Reportes de falla y sugerencias desde cualquier ventana
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────────────────────────────────────
-- REPORTES DE FALLA Y FEEDBACK — el buzón desde cualquier ventana de la app.
--
-- Cada ventana (tarea, proyecto, deal, cliente, clase…) trae una bandera
-- discreta que abre el formulario. El reporte guarda el CONTEXTO (qué ventana
-- era), la URL y la versión de la app — el "¿dónde te pasó?" viene solo.
-- Los reportes se ven en Actividad (módulo Sistema) y llegan a Slack.
-- Ejecutar en el SQL Editor. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.app_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete set null,
  kind        text not null default 'falla' check (kind in ('falla', 'mejora')),
  context     text,                -- qué ventana: "Tarea", "Proyecto: Wellness…", etc.
  message     text not null,
  url         text,
  app_version text,
  status      text not null default 'nuevo' check (status in ('nuevo', 'revisado', 'resuelto')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_app_feedback_time on app_feedback (created_at desc);

alter table app_feedback enable row level security;
drop policy if exists afb_insert on app_feedback;
create policy afb_insert on app_feedback for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists afb_select on app_feedback;
-- El Master revisa todo; cada quien puede ver lo suyo
create policy afb_select on app_feedback for select to authenticated
  using (hog_role() = 'MASTER' or user_id = auth.uid());
drop policy if exists afb_update on app_feedback;
create policy afb_update on app_feedback for update to authenticated
  using (hog_role() = 'MASTER') with check (hog_role() = 'MASTER');

notify pgrst, 'reload schema';

