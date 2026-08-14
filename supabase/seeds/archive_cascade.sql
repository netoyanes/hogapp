-- ─────────────────────────────────────────────────────────────────────────────
-- ARCHIVAR EN CASCADA — al archivar un proyecto, sus tareas se archivan con él.
--
-- El detalle fino está en RESTAURAR: si una tarea ya estaba archivada por su
-- cuenta antes de archivar el proyecto, restaurar el proyecto NO debe revivirla.
-- Por eso se marca cuáles se archivaron POR el proyecto; al restaurar solo se
-- devuelven esas.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
alter table tasks add column if not exists archived_with_event uuid references event_plans(id) on delete set null;
create index if not exists idx_tasks_archived_with_event on tasks (archived_with_event) where archived_with_event is not null;

notify pgrst, 'reload schema';
