-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Acceso de piso (Heart of House) — usuario + PIN
-- Los HoH no tienen correo: se les crea una cuenta con usuario (≥8 letras) y un
-- PIN numérico como contraseña, mediante la función hoh-provision (service role).
-- El usuario se guarda en profiles.username. Aquí solo se agrega la columna;
-- la creación de la cuenta la hace la Edge Function.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

alter table profiles add column if not exists username text unique;
