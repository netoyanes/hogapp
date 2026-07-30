-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Reservas públicas — link compartible por venue
-- El cliente entra a ?reservar=<CÓDIGO>, llena sus datos y la reserva se crea
-- (status 'requested', source 'web') respetando las reglas del venue: cupo de
-- la noche y umbral de apartado. La escritura la hace el Edge Function
-- public-reservation (service role); el flag controla qué venues lo exponen.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- Flag por venue: solo los que lo tengan en true aceptan reservas por el link.
alter table business_units add column if not exists public_booking_enabled boolean not null default false;

-- Nueva fuente de reserva: 'web' (formulario público)
alter table reservations drop constraint if exists reservations_source_check;
alter table reservations add constraint reservations_source_check
  check (source in ('phone','whatsapp','instagram','walk_in','internal','web'));
