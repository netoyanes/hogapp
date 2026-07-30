-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Horario de operación por venue + cupo por hora
-- venue_capacity ya guarda el cupo TOTAL por día (max_pax) y el máximo de
-- reservas (max_reservations). Aquí se agrega el horario de operación
-- (abre/cierra) para poder mostrar cuántos espacios quedan libres por hora.
-- Modelo de horarios libres: quien llega a la hora H ocupa su lugar de H al
-- cierre (no hay salida forzada) → la ocupación por hora es acumulada.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

alter table venue_capacity add column if not exists open_time  text;   -- 'HH:MM'
alter table venue_capacity add column if not exists close_time text;   -- 'HH:MM' (puede cruzar medianoche)
