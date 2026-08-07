-- PISO · Secciones ("mis mesas" del mesero) — 1 columna. Idempotente.
alter table venue_tables add column if not exists section text;
