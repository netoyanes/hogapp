-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Reacciones a comentarios (Tareas y CRM)
-- Tabla única para reaccionar con emoji a un comentario de tarea
-- (task_comments) o a una actividad/comentario de deal (crm_activities).
-- Una reacción por (comentario, emoji, usuario) — se togglea.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.comment_reactions (
  id           uuid primary key default gen_random_uuid(),
  parent_type  text not null check (parent_type in ('task_comment', 'deal_activity')),
  parent_id    uuid not null,
  emoji        text not null,
  user_id      uuid not null references profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (parent_type, parent_id, emoji, user_id)
);
create index if not exists idx_reactions_parent on comment_reactions (parent_type, parent_id);

alter table comment_reactions enable row level security;
drop policy if exists reactions_select on comment_reactions;
create policy reactions_select on comment_reactions for select using (auth.role() = 'authenticated');
drop policy if exists reactions_insert on comment_reactions;
create policy reactions_insert on comment_reactions for insert with check (auth.uid() = user_id);
drop policy if exists reactions_delete on comment_reactions;
create policy reactions_delete on comment_reactions for delete using (auth.uid() = user_id);
