-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Chat unificado con menciones y doble palomita
--  · event_comments: chat de cada proyecto/evento (tareas usan task_comments,
--    deals usan crm_activities — ya existentes)
--  · comment_reads: recibos de lectura (✓✓) para los TRES chats
--  · comment_reactions acepta 'event_comment' como parent_type
--  · fn_unread_messages(uuid): resumen de mensajes sin leer por entidad
--    relacionada contigo (asignado/creador/seguidor/responsable/participante)
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- Nada se elimina: los proyectos/eventos se ARCHIVAN (tasks ya tiene archived)
alter table event_plans add column if not exists archived boolean not null default false;

-- Chat del proyecto/evento
create table if not exists public.event_comments (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references event_plans(id) on delete cascade,
  author_id  uuid references profiles(id) on delete set null,
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_event_comments_event on event_comments (event_id, created_at);

alter table event_comments enable row level security;
drop policy if exists evcomments_select on event_comments;
create policy evcomments_select on event_comments for select using (auth.role() = 'authenticated');
drop policy if exists evcomments_insert on event_comments;
create policy evcomments_insert on event_comments for insert with check (auth.uid() = author_id);
drop policy if exists evcomments_delete on event_comments;
create policy evcomments_delete on event_comments for delete using (auth.uid() = author_id);

-- Recibos de lectura (doble palomita) — scope: task | event | deal
create table if not exists public.comment_reads (
  scope      text not null check (scope in ('task', 'event', 'deal')),
  comment_id uuid not null,
  user_id    uuid not null references profiles(id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (scope, comment_id, user_id)
);
create index if not exists idx_comment_reads_user on comment_reads (user_id);
create index if not exists idx_comment_reads_comment on comment_reads (scope, comment_id);

alter table comment_reads enable row level security;
drop policy if exists creads_select on comment_reads;
create policy creads_select on comment_reads for select using (auth.role() = 'authenticated');
drop policy if exists creads_insert on comment_reads;
create policy creads_insert on comment_reads for insert with check (auth.uid() = user_id);

-- Reacciones también en comentarios de proyecto
alter table comment_reactions drop constraint if exists comment_reactions_parent_type_check;
alter table comment_reactions add constraint comment_reactions_parent_type_check
  check (parent_type in ('task_comment', 'deal_activity', 'event_comment'));

-- Mensajes sin leer del usuario, por entidad relacionada con él:
--  · tarea: asignada a él, creada por él o la sigue
--  · proyecto/evento: creado por él, es responsable o ya participó en el chat
--  · deal: creado por él o ya participó en la actividad
create or replace function public.fn_unread_messages(p_user uuid)
returns table(scope text, entity_id uuid, title text, unread bigint, last_at timestamptz)
language sql
security definer
set search_path = public
as $$
  with tc as (
    select 'task'::text as scope, t.id as entity_id, t.title, count(*) as unread, max(c.created_at) as last_at
    from tasks t
    join task_comments c on c.task_id = t.id
    where t.archived = false
      and (t.assigned_to = p_user or t.created_by = p_user
           or exists (select 1 from task_followers f where f.task_id = t.id and f.user_id = p_user))
      and c.author_id is distinct from p_user
      and not exists (select 1 from comment_reads r where r.scope = 'task' and r.comment_id = c.id and r.user_id = p_user)
    group by t.id, t.title
  ),
  ec as (
    select 'event'::text, e.id, e.name, count(*), max(c.created_at)
    from event_plans e
    join event_comments c on c.event_id = e.id
    where e.archived = false
      and (e.created_by = p_user or e.responsible = p_user
           or exists (select 1 from event_comments c2 where c2.event_id = e.id and c2.author_id = p_user))
      and c.author_id is distinct from p_user
      and not exists (select 1 from comment_reads r where r.scope = 'event' and r.comment_id = c.id and r.user_id = p_user)
    group by e.id, e.name
  ),
  dc as (
    select 'deal'::text, d.id, d.title, count(*), max(a.created_at)
    from crm_deals d
    join crm_activities a on a.deal_id = d.id
    where (d.created_by = p_user
           or exists (select 1 from crm_activities a2 where a2.deal_id = d.id and a2.created_by = p_user))
      and a.created_by is distinct from p_user
      and not exists (select 1 from comment_reads r where r.scope = 'deal' and r.comment_id = a.id and r.user_id = p_user)
    group by d.id, d.title
  )
  select * from tc
  union all select * from ec
  union all select * from dc
  order by last_at desc
$$;

grant execute on function public.fn_unread_messages(uuid) to authenticated;
