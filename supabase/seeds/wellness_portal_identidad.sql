-- ═════════════════════════════════════════════════════════════════════════════
-- PORTAL WELLNESS · precio vigente hacia el alumno
--
-- El portal público mostraba el precio de cada clase (wellness_classes.price)
-- sin saber nada de la promoción. Con wellness_operacion.sql el precio vive en
-- wellness_config: precio regular, descuento vigente y precio resultante.
--
-- Este RPC lo expone al portal (anon, security definer, igual que el resto de
-- fn_wellness_*): devuelve SOLO lo que el alumno necesita ver — el nombre de
-- la casa y el precio con su promoción. Nada de metas ni de operación.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Requiere wellness.sql y wellness_operacion.sql.
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_wellness_info(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'venue',          b.name,
    'code',           b.code,
    -- Sin fila en wellness_config no hay promoción que anunciar: el portal
    -- entonces muestra el precio de cada clase, como siempre.
    'precio_regular', c.precio_regular,
    'descuento',      c.descuento,
    'precio_vigente', c.precio_vigente,
    'promocion',      coalesce(c.descuento, 0) > 0
  )
  from business_units b
  left join wellness_config c on c.bu_id = b.id
  where lower(b.code) = lower(p_code)
  limit 1
$$;

revoke all on function public.fn_wellness_info(text) from public;
grant execute on function public.fn_wellness_info(text) to anon, authenticated;

notify pgrst, 'reload schema';
