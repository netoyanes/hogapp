-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Tareas — clasificación por área + impacto en cliente
-- Reemplaza `type` (MAINTENANCE/HARDWARE/REPORT/CONTENT/PROJECT) por dos ejes:
-- · area: la función real del holding que la dueña (11 valores, agrupables en
--   4 macro-categorías en la UI: Operación, Comercial/Marketing, Corporativo,
--   Tecnología).
-- · client_impact: si la tarea es visible/notable para el cliente (consumidor
--   F&B, huésped de hotel, cliente wellness, quien reserva un pod…) o es
--   puramente interna/backoffice.
-- `type` se conserva sin usar (rastro de auditoría) — no se borra.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

alter table tasks add column if not exists area text check (area in (
  'piso','mantenimiento','concierge','talento',        -- Operación
  'marketing','comercial',                              -- Comercial y Marketing
  'finanzas','rrhh','legal','direccion',                -- Corporativo
  'tecnologia'                                          -- Tecnología
));
alter table tasks add column if not exists client_impact text check (client_impact in ('client_facing','internal'));

alter table task_templates add column if not exists area text check (area in (
  'piso','mantenimiento','concierge','talento',
  'marketing','comercial',
  'finanzas','rrhh','legal','direccion',
  'tecnologia'
));
alter table task_templates add column if not exists client_impact text check (client_impact in ('client_facing','internal'));

-- Backfill: mapeo razonable de los 5 tipos viejos a la nueva área
update tasks set area = case type
  when 'MAINTENANCE' then 'mantenimiento'
  when 'HARDWARE'    then 'mantenimiento'
  when 'REPORT'       then 'direccion'
  when 'CONTENT'       then 'marketing'
  when 'PROJECT'       then 'direccion'
  else 'direccion'
end where area is null;
update tasks set client_impact = 'internal' where client_impact is null;

update task_templates set area = case type
  when 'MAINTENANCE' then 'mantenimiento'
  when 'HARDWARE'    then 'mantenimiento'
  when 'REPORT'       then 'direccion'
  when 'CONTENT'       then 'marketing'
  when 'PROJECT'       then 'direccion'
  else 'direccion'
end where area is null;
update task_templates set client_impact = 'internal' where client_impact is null;
