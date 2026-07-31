-- ═════════════════════════════════════════════════════════════════════════════
-- FIX: el registro con correo verificaba la invitación ANTES de iniciar sesión
-- (como usuario anónimo). RLS de `invitations` solo permite leer a usuarios
-- autenticados → la consulta regresaba vacío y el registro se bloqueaba aunque
-- la invitación existiera. Esta función security definer verifica sin exponer
-- la lista de correos invitados.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.has_invitation(p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from invitations where lower(email) = lower(trim(p_email))
  );
$$;

revoke all on function public.has_invitation(text) from public;
grant execute on function public.has_invitation(text) to anon, authenticated;
