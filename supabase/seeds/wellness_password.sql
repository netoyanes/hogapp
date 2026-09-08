-- ═════════════════════════════════════════════════════════════════════════════
-- WELLNESS · CUENTAS CON CONTRASEÑA
--
-- Hasta ahora la cuenta se abría con teléfono + nombre de pila. Eso alcanzaba
-- para guardar un historial de clases; deja de alcanzar en cuanto la cuenta
-- guarda DINERO: un paquete de 10 clases o una membresía ilimitada.
--
-- bcrypt vía pgcrypto, coste 10. Nunca en claro, y la verificación ocurre
-- dentro de la función: el hash no sale de la base.
--
-- MIGRACIÓN SIN DEJAR A NADIE FUERA: quien ya tenía cuenta no tiene contraseña.
-- Esos entran una vez más con su nombre de pila —la respuesta trae
-- sin_password: true— y el portal les pide crearla. En cuanto la tienen, el
-- nombre deja de servir.
--
-- OJO: pgcrypto vive en el esquema `extensions`, y estas funciones fijan
-- search_path a public. Por eso crypt() y gen_salt() van calificados.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Requiere wellness.sql y wellness_alumnos.sql.
-- ═════════════════════════════════════════════════════════════════════════════

alter table wellness_students add column if not exists password_hash text;
alter table wellness_students add column if not exists password_set_at timestamptz;
-- Un RPC anónimo que verifica contraseñas es un oráculo de fuerza bruta si no
-- se le pone freno: ocho intentos y quince minutos de espera.
alter table wellness_students add column if not exists login_fails int not null default 0;
alter table wellness_students add column if not exists locked_until timestamptz;

comment on column wellness_students.password_hash is 'bcrypt. NULL = cuenta antigua, todavía entra con nombre de pila.';

-- El segundo parámetro deja de ser el nombre y pasa a ser la contraseña.
drop function if exists public.fn_wellness_login(text, text);

create or replace function public.fn_wellness_login(p_phone text, p_password text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_id uuid; v_tel text; v_nombre text; v_hash text; v_lock timestamptz;
  v_ok boolean;
begin
  v_tel := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_tel) < 10 then
    return jsonb_build_object('error', 'Escribe tu teléfono a 10 dígitos.');
  end if;

  select id, full_name, password_hash, locked_until
    into v_id, v_nombre, v_hash, v_lock
    from wellness_students where phone = v_tel;

  if v_id is null then return jsonb_build_object('nuevo', true); end if;

  if v_lock is not null and v_lock > now() then
    return jsonb_build_object('error', format(
      'Demasiados intentos. Vuelve a intentar en %s minutos.',
      greatest(1, ceil(extract(epoch from v_lock - now()) / 60)::int)));
  end if;

  if v_hash is not null then
    v_ok := v_hash = extensions.crypt(coalesce(p_password, ''), v_hash);
  else
    -- Cuenta antigua: el nombre de pila sirve una última vez.
    v_ok := lower(split_part(trim(v_nombre), ' ', 1))
          = lower(split_part(trim(coalesce(p_password, '')), ' ', 1));
  end if;

  if not v_ok then
    update wellness_students
       set login_fails = login_fails + 1,
           locked_until = case when login_fails + 1 >= 8 then now() + interval '15 minutes' end
     where id = v_id;
    return jsonb_build_object('error', case when v_hash is null
      then 'Ese teléfono está registrado con otro nombre.'
      else 'Contraseña incorrecta.' end);
  end if;

  update wellness_students set login_fails = 0, locked_until = null where id = v_id;

  return jsonb_build_object(
    'token', (select access_token from wellness_students where id = v_id),
    'name', v_nombre, 'returning', true,
    'sin_password', v_hash is null);
end $fn$;

create or replace function public.fn_wellness_set_password(p_token uuid, p_password text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if length(coalesce(p_password, '')) < 6 then
    return jsonb_build_object('error', 'La contraseña necesita al menos 6 caracteres.');
  end if;
  select id into v_id from wellness_students where access_token = p_token;
  if v_id is null then return jsonb_build_object('error', 'Tu acceso no es válido.'); end if;

  update wellness_students
     set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
         password_set_at = now(), login_fails = 0, locked_until = null
   where id = v_id;
  return jsonb_build_object('ok', true);
end $fn$;

-- EL HUECO QUE ESTO CIERRA: la versión anterior devolvía el token de una cuenta
-- existente con solo acertar teléfono + nombre de pila. Con contraseñas eso
-- sería una puerta trasera — quien supiera tu teléfono y tu nombre entraría a
-- tu membresía. Ahora, si la cuenta YA tiene contraseña, registrarse de nuevo
-- exige acertarla.
create or replace function public.fn_wellness_register(
  p_name text, p_phone text, p_email text, p_password text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_tel text; v_nombre text; v_hash text; v_tok uuid;
begin
  v_tel := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(trim(coalesce(p_name, ''))) < 3 or length(v_tel) < 10 then
    return jsonb_build_object('error', 'Nombre y teléfono (10 dígitos) son obligatorios.');
  end if;
  if length(coalesce(p_password, '')) < 6 then
    return jsonb_build_object('error', 'La contraseña necesita al menos 6 caracteres.');
  end if;

  select id, full_name, password_hash, access_token
    into v_id, v_nombre, v_hash, v_tok
    from wellness_students where phone = v_tel;

  if v_id is not null then
    if v_hash is not null then
      if v_hash <> extensions.crypt(p_password, v_hash) then
        return jsonb_build_object('error', 'Ese teléfono ya tiene cuenta. Entra con tu contraseña.');
      end if;
      return jsonb_build_object('token', v_tok, 'name', v_nombre, 'returning', true);
    end if;
    if lower(split_part(trim(v_nombre), ' ', 1)) <> lower(split_part(trim(p_name), ' ', 1)) then
      return jsonb_build_object('error', 'Ese teléfono ya está registrado con otro nombre. Escríbenos si es tuyo.');
    end if;
    update wellness_students
       set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
           password_set_at = now(),
           email = coalesce(nullif(trim(coalesce(p_email, '')), ''), email)
     where id = v_id;
    return jsonb_build_object('token', v_tok, 'name', v_nombre, 'returning', true);
  end if;

  insert into wellness_students (full_name, phone, email, password_hash, password_set_at)
  values (trim(p_name), v_tel, nullif(trim(coalesce(p_email, '')), ''),
          extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now())
  returning id, access_token into v_id, v_tok;
  return jsonb_build_object('token', v_tok, 'name', trim(p_name), 'returning', false);
end $fn$;

-- La firma de 3 argumentos se retira: dejarla viva sería dejar viva la puerta.
drop function if exists public.fn_wellness_register(text, text, text);

-- Reponer contraseña: todavía no hay recuperación por correo, así que la
-- persona se identifica en el mostrador y alguien del equipo le pone una.
create or replace function public.fn_wellness_reset_password(p_phone text, p_password text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_tel text;
begin
  if hog_role() not in ('MASTER', 'ADMIN') then
    return jsonb_build_object('error', 'Solo el equipo puede reponer contraseñas.');
  end if;
  if length(coalesce(p_password, '')) < 6 then
    return jsonb_build_object('error', 'La contraseña necesita al menos 6 caracteres.');
  end if;
  v_tel := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  update wellness_students
     set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
         password_set_at = now(), login_fails = 0, locked_until = null
   where phone = v_tel returning id into v_id;
  if v_id is null then return jsonb_build_object('error', 'No hay cuenta con ese teléfono.'); end if;
  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.fn_wellness_login(text, text) from public;
revoke all on function public.fn_wellness_set_password(uuid, text) from public;
revoke all on function public.fn_wellness_register(text, text, text, text) from public;
revoke all on function public.fn_wellness_reset_password(text, text) from public;
do $g$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.fn_wellness_login(text, text) to anon;
    grant execute on function public.fn_wellness_set_password(uuid, text) to anon;
    grant execute on function public.fn_wellness_register(text, text, text, text) to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.fn_wellness_login(text, text) to authenticated;
    grant execute on function public.fn_wellness_set_password(uuid, text) to authenticated;
    grant execute on function public.fn_wellness_register(text, text, text, text) to authenticated;
    grant execute on function public.fn_wellness_reset_password(text, text) to authenticated;
  end if;
end $g$;

notify pgrst, 'reload schema';
