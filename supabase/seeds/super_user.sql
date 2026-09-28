-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Nivel SUPER (Fase 0 de docs/propuesta-accesos.md)
--
-- · SUPER = MASTER + bandera is_super. Se conserva role='MASTER' para que las
--   ~50 policies que hoy dicen hog_role() = 'MASTER' sigan dejándolo pasar
--   sin tocarlas; lo que SUPER tiene de más se protege con hog_is_super().
-- · Cierra la auto-promoción de rol: en el repo la única policy de escritura
--   sobre profiles es "Users can update own profile" (auth.uid() = id) sin
--   restringir columnas, así que cualquier usuario podía hacerse MASTER con
--   su propio token. A partir de aquí:
--     - is_super solo lo cambia un SUPER.
--     - Nombrar o quitar un MASTER solo lo hace un SUPER.
--     - Un MASTER solo cambia el rol de quien NO es MASTER ni SUPER.
--     - Nadie más puede cambiar su propio rol.
--   Desde el SQL Editor / service role (auth.uid() es null) todo se permite,
--   para poder administrar a mano.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1. Bandera ──────────────────────────────────────────────────────────────
alter table profiles add column if not exists is_super boolean not null default false;

-- ─── 2. Helpers ──────────────────────────────────────────────────────────────
-- coalesce a propósito: un permiso es sí o no, nunca "no sé".
create or replace function public.hog_is_super() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select is_super from profiles where id = auth.uid()), false) $$;

create or replace function public.hog_is_master() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(hog_role() = 'MASTER', false) $$;

revoke all on function public.hog_is_super() from public;
revoke all on function public.hog_is_master() from public;
grant execute on function public.hog_is_super() to authenticated;
grant execute on function public.hog_is_master() to authenticated;

-- ─── 3. Guardia contra escalación de privilegios ─────────────────────────────
create or replace function public.fn_guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  -- Sin sesión (SQL Editor, service role): administración manual, se permite.
  if v_uid is null then
    return new;
  end if;

  -- is_super: solo un SUPER lo toca.
  if new.is_super is distinct from old.is_super and not hog_is_super() then
    raise exception 'Solo un Super puede cambiar is_super';
  end if;

  -- Al perfil de un SUPER solo lo edita él mismo u otro SUPER.
  if old.is_super and v_uid <> old.id and not hog_is_super() then
    raise exception 'El perfil de un Super solo lo edita un Super';
  end if;

  if new.role is distinct from old.role then
    if hog_is_super() then
      return new;
    end if;
    -- Un MASTER administra hacia abajo: nunca nombra ni degrada MASTERs.
    if hog_is_master() and v_uid <> old.id
       and old.role is distinct from 'MASTER' and new.role is distinct from 'MASTER' then
      return new;
    end if;
    raise exception 'No tienes permiso para cambiar este rol';
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_profile_privileges on profiles;
create trigger trg_guard_profile_privileges
  before update on profiles
  for each row execute function public.fn_guard_profile_privileges();

-- ─── 4. Policies para que MASTER/SUPER administren perfiles ajenos ───────────
-- (la pantalla Usuarios ya lo asume; el trigger de arriba acota qué columnas)
drop policy if exists prof_admin_select on profiles;
create policy prof_admin_select on profiles for select to authenticated
  using (auth.uid() = id or hog_is_master());

drop policy if exists prof_admin_update on profiles;
create policy prof_admin_update on profiles for update to authenticated
  using (hog_is_master()) with check (hog_is_master());

-- ─── 5. Super user ───────────────────────────────────────────────────────────
update profiles
   set role = 'MASTER', is_super = true
 where lower(email) = 'neto@swells.mx';

-- Verificación: debe devolver exactamente una fila con is_super = true.
select id, email, role, is_super from profiles where is_super;
