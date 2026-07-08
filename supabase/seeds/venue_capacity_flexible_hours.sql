-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Reservas — horarios libres (sin turnos fijos)
-- Colapsa venue_capacity de "por slot" a "por día": la capacidad ahora es un
-- cupo total para la noche, sin ventanas de horario. El cliente llega a la
-- hora que quiera y se queda el tiempo que guste — sin salida forzada.
-- reservations.time_slot se conserva (texto libre) pero ahora guarda una
-- hora puntual de llegada ("20:30"), no un rango.
-- Ejecutar en el SQL Editor de Supabase. Idempotente-friendly (usa temp table).
-- ═════════════════════════════════════════════════════════════════════════════

do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'venue_capacity' and column_name = 'time_slot') then
    -- Colapsar filas existentes por (bu_id, day_of_week): suma de las
    -- capacidades de los slots que hubiera ese día; activo si alguno lo estaba.
    create temp table venue_capacity_collapsed as
    select bu_id, day_of_week,
           sum(max_reservations) as max_reservations,
           sum(max_pax) as max_pax,
           bool_or(active) as active
    from venue_capacity
    group by bu_id, day_of_week;

    truncate table venue_capacity;

    -- Quita la unique constraint vieja (bu_id, day_of_week, time_slot) —
    -- el nombre es el que Postgres genera por default para esa definición inline.
    alter table venue_capacity drop constraint if exists venue_capacity_bu_id_day_of_week_time_slot_key;
    alter table venue_capacity drop column time_slot;

    insert into venue_capacity (bu_id, day_of_week, max_reservations, max_pax, active)
    select bu_id, day_of_week, max_reservations, max_pax, active from venue_capacity_collapsed;

    drop table venue_capacity_collapsed;
  end if;
end $$;

-- Nueva unique constraint: un cupo por venue+día (ya no por slot)
alter table venue_capacity drop constraint if exists venue_capacity_bu_id_day_of_week_key;
alter table venue_capacity add constraint venue_capacity_bu_id_day_of_week_key unique (bu_id, day_of_week);
