-- ═════════════════════════════════════════════════════════════════════════════
-- PREVIEW DE COMPARTIR / PAUTA POR VENUE (Open Graph configurable)
--
-- Lo que Instagram/WhatsApp muestran al compartir /r/CODIGO — título,
-- descripción e imagen — se configura desde HOG APP (Reservas → Compartir),
-- no en código. Estas columnas son la fuente; la función serverless /r/ las
-- lee vía fn_og_meta.
--
-- fn_og_meta existe porque el robot de Meta llega como ANÓNIMO: en vez de
-- abrirle SELECT a business_units entera, la función le entrega SOLO los 4
-- campos del preview. Ejecutar en el SQL Editor. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════
alter table business_units add column if not exists og_title       text;
alter table business_units add column if not exists og_description text;
alter table business_units add column if not exists og_image_url   text;

create or replace function public.fn_og_meta(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', name, 'og_title', og_title,
    'og_description', og_description, 'og_image_url', og_image_url)
  from business_units where lower(code) = lower(p_code) limit 1
$$;
revoke all on function public.fn_og_meta(text) from public;
grant execute on function public.fn_og_meta(text) to anon, authenticated;

notify pgrst, 'reload schema';
