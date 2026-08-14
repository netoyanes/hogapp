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
