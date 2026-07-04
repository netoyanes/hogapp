-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Arreglo: "Database error deleting user" al borrar un usuario
-- ═════════════════════════════════════════════════════════════════════════════
-- Causa: al borrar un usuario de Supabase Auth, Postgres intenta borrar su fila
-- en public.profiles (id → auth.users). Ese FK y TODOS los que apuntan a
-- profiles(id) — created_by, assigned_to, scored_by, uploaded_by, status_changed_by,
-- user_venues, activity_log, etc. — estaban sin acción de borrado (RESTRICT por
-- defecto), así que cualquier fila que el usuario haya tocado bloquea el borrado.
--
-- Solución: reescribir la regla ON DELETE de cada FK que apunte a auth.users o a
-- public.profiles, según si la columna admite nulos:
--   · Columna NOT NULL (identidad del registro: profiles.id, user_venues.user_id)
--     → ON DELETE CASCADE  (la fila no tiene sentido sin el usuario, se borra).
--   · Columna que admite null (columnas de auditoría "quién lo hizo": created_by,
--     scored_by, assigned_to…) → ON DELETE SET NULL  (el registro se conserva, el
--     actor queda como desconocido).
--
-- El barrido es dinámico: cubre también tablas creadas desde el panel de Supabase
-- (p. ej. activity_log) que no viven en estos archivos. Idempotente: re-ejecutar
-- vuelve a aplicar exactamente las mismas reglas.
--
-- Ejecutar en el SQL Editor de Supabase.
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  r           record;
  col_notnull boolean;
  action      text;
begin
  for r in
    select con.conname,
           con.conrelid::regclass::text  as tbl,
           att.attname                   as col,
           con.confrelid::regclass::text as reftbl
    from pg_constraint con
    join pg_attribute  att
      on att.attrelid = con.conrelid
     and att.attnum   = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
      and coalesce(array_length(con.conkey, 1), 1) = 1   -- solo FKs de una columna
  loop
    select attnotnull into col_notnull
      from pg_attribute
     where attrelid = r.tbl::regclass and attname = r.col;

    action := case when col_notnull then 'cascade' else 'set null' end;

    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references %s (id) on delete %s',
      r.tbl, r.conname, r.col, r.reftbl, action
    );

    raise notice 'FK %.% → % : on delete %', r.tbl, r.col, r.reftbl, action;
  end loop;
end $$;

-- ─── Verificación: lista las reglas resultantes (c=cascade, n=set null) ──────
-- select conrelid::regclass as tabla, conname, confdeltype
--   from pg_constraint
--  where contype = 'f'
--    and confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
--  order by 1;
