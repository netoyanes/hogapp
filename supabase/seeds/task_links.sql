-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Tareas — links adjuntos (separados de los archivos)
-- Los archivos siguen en task_proofs (Storage). Los links son referencias
-- externas (Drive, Figma, YouTube, docs…) con su propia preview.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.task_links (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid references tasks(id) on delete cascade,
  url        text not null,
  title      text,                                    -- nombre opcional que le pone el usuario
  added_by   uuid references profiles(id) on delete set null,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_links_task on task_links (task_id);

alter table task_links enable row level security;
drop policy if exists task_links_select on task_links;
create policy task_links_select on task_links for select using (auth.role() = 'authenticated');
drop policy if exists task_links_insert on task_links;
create policy task_links_insert on task_links for insert with check (auth.role() = 'authenticated');
drop policy if exists task_links_update on task_links;
create policy task_links_update on task_links for update using (auth.role() = 'authenticated');
