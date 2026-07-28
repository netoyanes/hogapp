-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Unidades de negocio — actualización del catálogo (jul 2026)
-- Renombra Ajeno→Casa Ajeno (conserva su historial), da de alta/actualiza las
-- BU finales por código, y elimina Amorcafemx y Cafesca_mx.
-- La app las muestra en orden alfabético por nombre (cambio de UI aparte).
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. Renombrar Ajeno (AJ) → Casa Ajeno (CA) conservando su fila y su historial
update business_units set code = 'CA', name = 'Casa Ajeno' where code = 'AJ';

-- 2. Alta / actualización de todas las BU finales (llave = código)
insert into business_units (code, name) values
  ('AM', 'Apricot MZT'),
  ('AR', 'Apricot ROMA'),
  ('BM', 'Bruma MZT'),
  ('BR', 'Bruma Records'),
  ('CA', 'Casa Ajeno'),
  ('CC', 'Casa Coyote'),
  ('CL', 'Calma'),
  ('ET', 'Eterno'),
  ('HG', 'HOG'),
  ('OC', 'Oyster CLUB'),
  ('PC', 'POD Condesa'),
  ('PM', 'POD Mazatlan'),
  ('TI', 'TONIC IV')
on conflict (code) do update set name = excluded.name, updated_at = now();

-- 3. Eliminar las que salen del holding
-- (si truena por referencias de otra tabla, avísame y limpiamos primero)
delete from business_units where code in ('AC', 'CM');
