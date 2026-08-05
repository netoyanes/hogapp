-- Eventos v2 — detalles de planeación que faltaban (referencia Asana):
-- asistencia esperada, requerimientos y colaboradores/talento. Idempotente.
alter table event_plans add column if not exists expected_attendance int;
alter table event_plans add column if not exists requirements text;
alter table event_plans add column if not exists collaborators text;
