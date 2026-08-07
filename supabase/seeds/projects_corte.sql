-- PROYECTOS · Corte post-evento: lo REAL contra lo presupuestado.
-- Idempotente — 2 columnas.
alter table project_budget_items add column if not exists actual_amount numeric;
alter table event_plans add column if not exists actual_attendance int;
