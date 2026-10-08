-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · OBRAS — avance diario de remodelaciones con gente externa
--
-- Una remodelación la ejecutan albañiles, electricistas, el de mantenimiento
-- y proveedores que NO tienen cuenta en HOG APP ni la van a tener. Lo que
-- dirección necesita de ellos es una sola cosa: saber, día con día, qué se
-- hizo, quién lo hizo, qué cambió y cuánto está costando.
--
-- Así que cada obra tiene un LINK PÚBLICO (?obra=CODIGO) que se abre en el
-- celular. Quien entra se identifica con su celular y un PIN de 4 a 6 dígitos
-- (la primera vez da su nombre). A partir de ahí todo lo que toca queda
-- firmado: palomear, despalomear, cambiar la fecha, la nota, el costo, quién
-- ejecuta, agregar una tarea, mandar el reporte del día.
--
-- LA BITÁCORA ES UN TRIGGER, NO UN FAVOR DE LA APP. obra_log se llena desde
-- la tabla misma: cualquier cambio a una tarea —venga del portal (miembro
-- externo) o de HOG APP (usuario con sesión)— deja su renglón con el antes y
-- el después de cada campo. Los RPCs del portal solo dicen quién es el actor
-- (set_config) antes de escribir; si nadie lo dice, el actor es auth.uid().
--
-- Acceso interno: EXCLUSIVO del Master. Nadie más en HOG APP ve las obras.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Requiere: hog_role(), touch_updated_at(), business_units, profiles.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Acceso interno ───────────────────────────────────────────────────────────
create or replace function public.fn_can_obras()
returns boolean language sql stable security definer set search_path = public as $$
  select hog_role() = 'MASTER'
$$;
revoke all on function public.fn_can_obras() from public;
grant execute on function public.fn_can_obras() to authenticated;

-- ── Tablas ───────────────────────────────────────────────────────────────────
create table if not exists obras (
  id            uuid primary key default gen_random_uuid(),
  bu_id         uuid references business_units(id) on delete set null,
  -- Lo que va en el link. Corto, en mayúsculas, sin caracteres confusos.
  code          text not null unique,
  nombre        text not null,
  descripcion   text,
  responsable   text,                 -- quién responde por la obra (texto libre: puede ser externo)
  meta_fecha    date,                 -- "todo listo el…"
  presupuesto   numeric,              -- tope de gasto, si lo hay
  estado        text not null default 'activa' check (estado in ('activa', 'pausada', 'cerrada')),
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists obras_bu on obras (bu_id, estado);

create table if not exists obra_grupos (
  id        uuid primary key default gen_random_uuid(),
  obra_id   uuid not null references obras(id) on delete cascade,
  nombre    text not null,
  orden     int not null default 0
);
create index if not exists obra_grupos_obra on obra_grupos (obra_id, orden);

create table if not exists obra_tareas (
  id               uuid primary key default gen_random_uuid(),
  obra_id          uuid not null references obras(id) on delete cascade,
  grupo_id         uuid references obra_grupos(id) on delete set null,
  titulo           text not null,
  detalle          text,
  orden            int not null default 0,
  hecho            boolean not null default false,
  hecho_at         timestamptz,
  hecho_por        text,              -- nombre de quien palomeó (denormalizado: se lee sin joins)
  fecha_plan       date,              -- cuándo se va a hacer
  nota             text,              -- material, pendiente, quién
  requiere_dinero  boolean not null default false,
  costo_estimado   numeric,
  costo_real       numeric,
  ejecutor         text,              -- quién la ejecuta (nombre, empresa, "Daniel Mantenimiento")
  archivada        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists obra_tareas_obra on obra_tareas (obra_id, grupo_id, orden);

-- La gente externa. El celular es la identidad; el PIN, la llave.
create table if not exists obra_miembros (
  id            uuid primary key default gen_random_uuid(),
  obra_id       uuid not null references obras(id) on delete cascade,
  nombre        text not null,
  telefono      text not null,
  pin_hash      text not null,
  rol           text not null default 'ejecutor' check (rol in ('ejecutor', 'supervisor')),
  activo        boolean not null default true,
  access_token  uuid not null unique default gen_random_uuid(),
  login_fails   int not null default 0,
  locked_until  timestamptz,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (obra_id, telefono)
);
create index if not exists obra_miembros_token on obra_miembros (access_token);

-- Reporte del día: texto libre, opcionalmente colgado de una tarea.
create table if not exists obra_reportes (
  id          uuid primary key default gen_random_uuid(),
  obra_id     uuid not null references obras(id) on delete cascade,
  tarea_id    uuid references obra_tareas(id) on delete set null,
  miembro_id  uuid references obra_miembros(id) on delete set null,
  usuario_id  uuid references profiles(id) on delete set null,
  actor       text not null,
  fecha       date not null default (now() at time zone 'America/Mazatlan')::date,
  texto       text not null,
  created_at  timestamptz not null default now()
);
create index if not exists obra_reportes_obra on obra_reportes (obra_id, created_at desc);

-- La bitácora. Un renglón por acción y por campo cambiado.
create table if not exists obra_log (
  id          bigserial primary key,
  obra_id     uuid not null references obras(id) on delete cascade,
  tarea_id    uuid references obra_tareas(id) on delete set null,
  miembro_id  uuid references obra_miembros(id) on delete set null,
  usuario_id  uuid references profiles(id) on delete set null,
  actor       text not null,          -- quién, legible, aunque se borre el miembro
  accion      text not null,          -- check · uncheck · editar · crear_tarea · archivar · reporte · login · registro · crear_grupo
  campo       text,                   -- para 'editar': qué campo
  antes       jsonb,
  despues     jsonb,
  tarea_titulo text,                  -- para que la bitácora se lea sin joins
  created_at  timestamptz not null default now()
);
create index if not exists obra_log_obra on obra_log (obra_id, created_at desc);
create index if not exists obra_log_tarea on obra_log (tarea_id, created_at desc);

drop trigger if exists trg_obras_touch on obras;
create trigger trg_obras_touch before update on obras for each row execute function touch_updated_at();
drop trigger if exists trg_obra_tareas_touch on obra_tareas;
create trigger trg_obra_tareas_touch before update on obra_tareas for each row execute function touch_updated_at();

-- ── RLS interno ──────────────────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['obras', 'obra_grupos', 'obra_tareas', 'obra_miembros', 'obra_reportes', 'obra_log'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_rw on %I', t, t);
    execute format('create policy %I_rw on %I for all to authenticated using (fn_can_obras()) with check (fn_can_obras())', t, t);
  end loop;
end $$;

-- ── Quién está actuando ──────────────────────────────────────────────────────
-- Los RPCs del portal fijan al miembro antes de escribir. Si no hay miembro,
-- el actor es el usuario con sesión (edición desde HOG APP).
create or replace function public.fn_obra_actor()
returns table (miembro_id uuid, usuario_id uuid, actor text)
language plpgsql stable security definer set search_path = public as $$
declare v_m text := current_setting('obra.miembro', true);
begin
  if coalesce(v_m, '') <> '' then
    return query select m.id, null::uuid, m.nombre from obra_miembros m where m.id = v_m::uuid;
    return;
  end if;
  return query select null::uuid, auth.uid(),
    coalesce((select coalesce(nullif(trim(p.full_name), ''), p.email) from profiles p where p.id = auth.uid()), 'sistema');
end $$;
revoke all on function public.fn_obra_actor() from public, anon, authenticated;

-- ── Bitácora por trigger ─────────────────────────────────────────────────────
create or replace function public.fn_obra_tareas_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a record;
  campos text[] := array['titulo', 'detalle', 'fecha_plan', 'nota', 'requiere_dinero', 'costo_estimado', 'costo_real', 'ejecutor', 'grupo_id'];
  c text; v_antes jsonb; v_despues jsonb; jo jsonb; jn jsonb;
begin
  select * into a from fn_obra_actor();
  if tg_op = 'INSERT' then
    insert into obra_log (obra_id, tarea_id, miembro_id, usuario_id, actor, accion, despues, tarea_titulo)
    values (new.obra_id, new.id, a.miembro_id, a.usuario_id, a.actor, 'crear_tarea',
            jsonb_build_object('titulo', new.titulo, 'detalle', new.detalle), new.titulo);
    return new;
  end if;
  if tg_op = 'DELETE' then
    -- Si la obra entera se está borrando (cascada), ya no hay a qué colgar el
    -- renglón: la bitácora se va con la obra.
    if exists (select 1 from obras where id = old.obra_id) then
      insert into obra_log (obra_id, tarea_id, miembro_id, usuario_id, actor, accion, antes, tarea_titulo)
      values (old.obra_id, null, a.miembro_id, a.usuario_id, a.actor, 'borrar',
              jsonb_build_object('titulo', old.titulo), old.titulo);
    end if;
    return old;
  end if;
  -- UPDATE
  if new.hecho is distinct from old.hecho then
    new.hecho_at := case when new.hecho then now() end;
    new.hecho_por := case when new.hecho then a.actor end;
    insert into obra_log (obra_id, tarea_id, miembro_id, usuario_id, actor, accion, tarea_titulo)
    values (new.obra_id, new.id, a.miembro_id, a.usuario_id, a.actor, case when new.hecho then 'check' else 'uncheck' end, new.titulo);
  end if;
  if new.archivada and not old.archivada then
    insert into obra_log (obra_id, tarea_id, miembro_id, usuario_id, actor, accion, tarea_titulo)
    values (new.obra_id, new.id, a.miembro_id, a.usuario_id, a.actor, 'archivar', new.titulo);
  end if;
  jo := to_jsonb(old); jn := to_jsonb(new);
  foreach c in array campos loop
    v_antes := jo -> c; v_despues := jn -> c;
    if v_antes is distinct from v_despues then
      insert into obra_log (obra_id, tarea_id, miembro_id, usuario_id, actor, accion, campo, antes, despues, tarea_titulo)
      values (new.obra_id, new.id, a.miembro_id, a.usuario_id, a.actor, 'editar', c, v_antes, v_despues, new.titulo);
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.fn_obra_tareas_audit() from public, anon, authenticated;

-- Dos triggers, una función: el UPDATE va BEFORE porque firma la fila (hecho_at,
-- hecho_por); el INSERT y el DELETE van AFTER porque la bitácora apunta a la
-- tarea con llave foránea y antes del insert la fila todavía no existe.
drop trigger if exists trg_obra_tareas_audit on obra_tareas;
drop trigger if exists trg_obra_tareas_audit_upd on obra_tareas;
create trigger trg_obra_tareas_audit_upd before update on obra_tareas
  for each row execute function fn_obra_tareas_audit();
drop trigger if exists trg_obra_tareas_audit_ins_del on obra_tareas;
create trigger trg_obra_tareas_audit_ins_del after insert or delete on obra_tareas
  for each row execute function fn_obra_tareas_audit();

-- ── Código de obra ───────────────────────────────────────────────────────────
-- 6 caracteres sin O/0/I/1. Se usa en el link y se dicta por teléfono.
create or replace function public.fn_obra_nuevo_codigo()
returns text language plpgsql security definer set search_path = public as $$
declare alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1); end loop;
    exit when not exists (select 1 from obras where code = c);
  end loop;
  return c;
end $$;
revoke all on function public.fn_obra_nuevo_codigo() from public, anon;
grant execute on function public.fn_obra_nuevo_codigo() to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- PORTAL (anon) — todo pasa por aquí; el portal no toca tablas.
-- ═════════════════════════════════════════════════════════════════════════════

-- Lo que se ve ANTES de identificarse: solo el nombre de la obra y el venue.
create or replace function public.fn_obra_portada(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'nombre', o.nombre, 'venue', b.name, 'estado', o.estado, 'meta_fecha', o.meta_fecha,
    'total', (select count(*) from obra_tareas t where t.obra_id = o.id and not t.archivada),
    'hechas', (select count(*) from obra_tareas t where t.obra_id = o.id and not t.archivada and t.hecho))
  from obras o left join business_units b on b.id = o.bu_id
  where upper(o.code) = upper(trim(p_code))
$$;

-- Entrar: celular + PIN. Si el celular no está en esta obra → {nuevo:true} y el
-- portal pide nombre para registrarlo. Ocho fallos → quince minutos de espera.
create or replace function public.fn_obra_login(p_code text, p_telefono text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_obra obras%rowtype; v_m obra_miembros%rowtype; v_tel text;
begin
  select * into v_obra from obras where upper(code) = upper(trim(p_code));
  if v_obra.id is null then return jsonb_build_object('error', 'Esta obra no existe o el link está mal.'); end if;
  if v_obra.estado = 'cerrada' then return jsonb_build_object('error', 'Esta obra ya se cerró.'); end if;
  v_tel := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  if length(v_tel) < 10 then return jsonb_build_object('error', 'Escribe tu celular a 10 dígitos.'); end if;

  select * into v_m from obra_miembros where obra_id = v_obra.id and telefono = v_tel;
  if v_m.id is null then return jsonb_build_object('nuevo', true); end if;
  if not v_m.activo then return jsonb_build_object('error', 'Tu acceso a esta obra está desactivado. Habla con quien la coordina.'); end if;
  if v_m.locked_until is not null and v_m.locked_until > now() then
    return jsonb_build_object('error', format('Demasiados intentos. Vuelve a intentar en %s minutos.',
      greatest(1, ceil(extract(epoch from v_m.locked_until - now()) / 60)::int)));
  end if;
  if v_m.pin_hash <> extensions.crypt(coalesce(p_pin, ''), v_m.pin_hash) then
    update obra_miembros set login_fails = login_fails + 1,
      locked_until = case when login_fails + 1 >= 8 then now() + interval '15 minutes' end
     where id = v_m.id;
    return jsonb_build_object('error', 'PIN incorrecto.');
  end if;

  update obra_miembros set login_fails = 0, locked_until = null, last_seen_at = now() where id = v_m.id;
  insert into obra_log (obra_id, miembro_id, actor, accion) values (v_obra.id, v_m.id, v_m.nombre, 'login');
  return jsonb_build_object('token', v_m.access_token, 'nombre', v_m.nombre, 'rol', v_m.rol);
end $$;

-- Registrarse: la primera vez. Si el celular ya tiene cuenta, hay que entrar
-- con su PIN — registrarse de nuevo no es una puerta trasera.
create or replace function public.fn_obra_registro(p_code text, p_nombre text, p_telefono text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_obra obras%rowtype; v_tel text; v_id uuid; v_tok uuid;
begin
  select * into v_obra from obras where upper(code) = upper(trim(p_code));
  if v_obra.id is null then return jsonb_build_object('error', 'Esta obra no existe o el link está mal.'); end if;
  if v_obra.estado = 'cerrada' then return jsonb_build_object('error', 'Esta obra ya se cerró.'); end if;
  v_tel := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  if length(trim(coalesce(p_nombre, ''))) < 3 then return jsonb_build_object('error', 'Escribe tu nombre completo.'); end if;
  if length(v_tel) < 10 then return jsonb_build_object('error', 'Escribe tu celular a 10 dígitos.'); end if;
  if coalesce(p_pin, '') !~ '^\d{4,6}$' then return jsonb_build_object('error', 'El PIN son 4 a 6 números.'); end if;
  if exists (select 1 from obra_miembros where obra_id = v_obra.id and telefono = v_tel) then
    return jsonb_build_object('error', 'Ese celular ya está registrado en esta obra. Entra con tu PIN.');
  end if;

  insert into obra_miembros (obra_id, nombre, telefono, pin_hash, last_seen_at)
  values (v_obra.id, trim(p_nombre), v_tel, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), now())
  returning id, access_token into v_id, v_tok;
  insert into obra_log (obra_id, miembro_id, actor, accion) values (v_obra.id, v_id, trim(p_nombre), 'registro');
  return jsonb_build_object('token', v_tok, 'nombre', trim(p_nombre), 'rol', 'ejecutor');
end $$;

-- Resuelve el token a un miembro activo de una obra abierta. Fija el actor
-- para el trigger de bitácora y actualiza "visto por última vez".
create or replace function public.fn_obra_miembro_por_token(p_token uuid)
returns obra_miembros language plpgsql security definer set search_path = public as $$
declare v_m obra_miembros%rowtype;
begin
  select m.* into v_m from obra_miembros m join obras o on o.id = m.obra_id
   where m.access_token = p_token and m.activo and o.estado <> 'cerrada';
  if v_m.id is null then raise exception 'SESION' using errcode = 'P0001'; end if;
  perform set_config('obra.miembro', v_m.id::text, true);
  update obra_miembros set last_seen_at = now() where id = v_m.id;
  return v_m;
end $$;
revoke all on function public.fn_obra_miembro_por_token(uuid) from public, anon, authenticated;

-- El plan completo: la obra, sus grupos con tareas, el equipo y los últimos
-- reportes. Una sola llamada: el portal pinta todo con esto.
create or replace function public.fn_obra_plan(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_m obra_miembros%rowtype; v_o obras%rowtype;
begin
  begin v_m := fn_obra_miembro_por_token(p_token);
  exception when others then return jsonb_build_object('sesion', false); end;
  select * into v_o from obras where id = v_m.obra_id;

  return jsonb_build_object(
    'sesion', true,
    'yo', jsonb_build_object('id', v_m.id, 'nombre', v_m.nombre, 'rol', v_m.rol),
    'obra', jsonb_build_object('id', v_o.id, 'code', v_o.code, 'nombre', v_o.nombre, 'descripcion', v_o.descripcion,
      'responsable', v_o.responsable, 'meta_fecha', v_o.meta_fecha, 'estado', v_o.estado, 'presupuesto', v_o.presupuesto,
      'venue', (select name from business_units where id = v_o.bu_id)),
    'grupos', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'nombre', g.nombre, 'orden', g.orden,
        'tareas', coalesce((
          select jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.titulo, 'detalle', t.detalle, 'orden', t.orden,
            'hecho', t.hecho, 'hecho_at', t.hecho_at, 'hecho_por', t.hecho_por, 'fecha_plan', t.fecha_plan,
            'nota', t.nota, 'requiere_dinero', t.requiere_dinero, 'costo_estimado', t.costo_estimado,
            'costo_real', t.costo_real, 'ejecutor', t.ejecutor, 'updated_at', t.updated_at) order by t.orden, t.created_at)
          from obra_tareas t where t.grupo_id = g.id and not t.archivada), '[]'::jsonb))
        order by g.orden, g.nombre)
      from obra_grupos g where g.obra_id = v_o.id), '[]'::jsonb),
    -- Tareas sin grupo (si alguien borró el grupo) para que no se pierdan
    'sueltas', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.titulo, 'detalle', t.detalle, 'orden', t.orden,
        'hecho', t.hecho, 'hecho_at', t.hecho_at, 'hecho_por', t.hecho_por, 'fecha_plan', t.fecha_plan,
        'nota', t.nota, 'requiere_dinero', t.requiere_dinero, 'costo_estimado', t.costo_estimado,
        'costo_real', t.costo_real, 'ejecutor', t.ejecutor, 'updated_at', t.updated_at) order by t.orden, t.created_at)
      from obra_tareas t where t.obra_id = v_o.id and t.grupo_id is null and not t.archivada), '[]'::jsonb),
    'equipo', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.nombre, 'rol', m.rol, 'last_seen_at', m.last_seen_at) order by m.nombre)
      from obra_miembros m where m.obra_id = v_o.id and m.activo), '[]'::jsonb),
    'reportes', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'actor', r.actor, 'fecha', r.fecha, 'texto', r.texto,
        'created_at', r.created_at, 'tarea', (select titulo from obra_tareas where id = r.tarea_id)) order by r.created_at desc)
      from (select * from obra_reportes where obra_id = v_o.id order by created_at desc limit 30) r), '[]'::jsonb)
  );
end $$;

-- Palomear / despalomear. El trigger escribe la bitácora y quién lo hizo.
create or replace function public.fn_obra_marcar(p_token uuid, p_tarea uuid, p_hecho boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_m obra_miembros%rowtype;
begin
  begin v_m := fn_obra_miembro_por_token(p_token);
  exception when others then return jsonb_build_object('sesion', false); end;
  update obra_tareas set hecho = p_hecho where id = p_tarea and obra_id = v_m.obra_id and not archivada;
  if not found then return jsonb_build_object('error', 'Esa tarea ya no está.'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Editar una tarea: solo los campos permitidos; cada cambio queda en la bitácora.
create or replace function public.fn_obra_editar(p_token uuid, p_tarea uuid, p_cambios jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_m obra_miembros%rowtype; v_t obra_tareas%rowtype;
begin
  begin v_m := fn_obra_miembro_por_token(p_token);
  exception when others then return jsonb_build_object('sesion', false); end;
  select * into v_t from obra_tareas where id = p_tarea and obra_id = v_m.obra_id and not archivada;
  if v_t.id is null then return jsonb_build_object('error', 'Esa tarea ya no está.'); end if;
  if p_cambios ? 'titulo' and length(trim(coalesce(p_cambios ->> 'titulo', ''))) < 3 then
    return jsonb_build_object('error', 'El título no puede quedar vacío.');
  end if;

  update obra_tareas set
    titulo          = case when p_cambios ? 'titulo' then trim(p_cambios ->> 'titulo') else titulo end,
    detalle         = case when p_cambios ? 'detalle' then nullif(trim(p_cambios ->> 'detalle'), '') else detalle end,
    fecha_plan      = case when p_cambios ? 'fecha_plan' then nullif(p_cambios ->> 'fecha_plan', '')::date else fecha_plan end,
    nota            = case when p_cambios ? 'nota' then nullif(trim(p_cambios ->> 'nota'), '') else nota end,
    requiere_dinero = case when p_cambios ? 'requiere_dinero' then coalesce((p_cambios ->> 'requiere_dinero')::boolean, false) else requiere_dinero end,
    costo_estimado  = case when p_cambios ? 'costo_estimado' then nullif(p_cambios ->> 'costo_estimado', '')::numeric else costo_estimado end,
    costo_real      = case when p_cambios ? 'costo_real' then nullif(p_cambios ->> 'costo_real', '')::numeric else costo_real end,
    ejecutor        = case when p_cambios ? 'ejecutor' then nullif(trim(p_cambios ->> 'ejecutor'), '') else ejecutor end
  where id = v_t.id;
  return jsonb_build_object('ok', true);
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
  return jsonb_build_object('error', 'Revisa la fecha o el costo: no se entendió el valor.');
end $$;

-- Agregar una tarea que no estaba en el plan (surgió en la obra).
create or replace function public.fn_obra_nueva_tarea(p_token uuid, p_grupo uuid, p_titulo text, p_detalle text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_m obra_miembros%rowtype; v_id uuid; v_orden int;
begin
  begin v_m := fn_obra_miembro_por_token(p_token);
  exception when others then return jsonb_build_object('sesion', false); end;
  if length(trim(coalesce(p_titulo, ''))) < 3 then return jsonb_build_object('error', 'Escribe qué hay que hacer.'); end if;
  if p_grupo is not null and not exists (select 1 from obra_grupos where id = p_grupo and obra_id = v_m.obra_id) then
    return jsonb_build_object('error', 'Ese grupo no es de esta obra.');
  end if;
  select coalesce(max(orden), 0) + 1 into v_orden from obra_tareas where obra_id = v_m.obra_id and grupo_id is not distinct from p_grupo;
  insert into obra_tareas (obra_id, grupo_id, titulo, detalle, orden)
  values (v_m.obra_id, p_grupo, trim(p_titulo), nullif(trim(coalesce(p_detalle, '')), ''), v_orden)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- El reporte del día.
create or replace function public.fn_obra_reportar(p_token uuid, p_texto text, p_tarea uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_m obra_miembros%rowtype; v_id uuid;
begin
  begin v_m := fn_obra_miembro_por_token(p_token);
  exception when others then return jsonb_build_object('sesion', false); end;
  if length(trim(coalesce(p_texto, ''))) < 3 then return jsonb_build_object('error', 'Cuéntanos qué se hizo hoy.'); end if;
  if p_tarea is not null and not exists (select 1 from obra_tareas where id = p_tarea and obra_id = v_m.obra_id) then
    return jsonb_build_object('error', 'Esa tarea no es de esta obra.');
  end if;
  insert into obra_reportes (obra_id, tarea_id, miembro_id, actor, texto)
  values (v_m.obra_id, p_tarea, v_m.id, v_m.nombre, trim(p_texto)) returning id into v_id;
  insert into obra_log (obra_id, tarea_id, miembro_id, actor, accion, despues, tarea_titulo)
  values (v_m.obra_id, p_tarea, v_m.id, v_m.nombre, 'reporte', jsonb_build_object('texto', trim(p_texto)),
          (select titulo from obra_tareas where id = p_tarea));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Historial: de una tarea, o de toda la obra (p_tarea null). Lo último primero.
create or replace function public.fn_obra_historial(p_token uuid, p_tarea uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_m obra_miembros%rowtype;
begin
  begin v_m := fn_obra_miembro_por_token(p_token);
  exception when others then return jsonb_build_object('sesion', false); end;
  return jsonb_build_object('sesion', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'actor', l.actor, 'accion', l.accion, 'campo', l.campo,
      'antes', l.antes, 'despues', l.despues, 'tarea_titulo', l.tarea_titulo, 'created_at', l.created_at) order by l.created_at desc)
    from (select * from obra_log where obra_id = v_m.obra_id and (p_tarea is null or tarea_id = p_tarea)
            and accion <> 'login' order by created_at desc limit 100) l), '[]'::jsonb));
end $$;

-- ── Permisos de los RPCs del portal ──────────────────────────────────────────
do $g$ declare f text; begin
  foreach f in array array[
    'fn_obra_portada(text)', 'fn_obra_login(text, text, text)', 'fn_obra_registro(text, text, text, text)',
    'fn_obra_plan(uuid)', 'fn_obra_marcar(uuid, uuid, boolean)', 'fn_obra_editar(uuid, uuid, jsonb)',
    'fn_obra_nueva_tarea(uuid, uuid, text, text)', 'fn_obra_reportar(uuid, text, uuid)', 'fn_obra_historial(uuid, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function public.%s to anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', f);
    end if;
  end loop;
end $g$;

-- ── Para el equipo HOG: reponer el PIN de alguien que lo olvidó ──────────────
create or replace function public.fn_obra_reset_pin(p_miembro uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not fn_can_obras() then return jsonb_build_object('error', 'Sin acceso a Obras.'); end if;
  if coalesce(p_pin, '') !~ '^\d{4,6}$' then return jsonb_build_object('error', 'El PIN son 4 a 6 números.'); end if;
  update obra_miembros set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
    login_fails = 0, locked_until = null where id = p_miembro;
  if not found then return jsonb_build_object('error', 'No existe ese miembro.'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.fn_obra_reset_pin(uuid, text) from public, anon;
grant execute on function public.fn_obra_reset_pin(uuid, text) to authenticated;

-- Dar de alta a alguien desde HOG APP (sin esperar a que se registre solo).
create or replace function public.fn_obra_alta_miembro(p_obra uuid, p_nombre text, p_telefono text, p_pin text, p_rol text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tel text; v_id uuid;
begin
  if not fn_can_obras() then return jsonb_build_object('error', 'Sin acceso a Obras.'); end if;
  v_tel := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  if length(trim(coalesce(p_nombre, ''))) < 3 then return jsonb_build_object('error', 'Escribe el nombre completo.'); end if;
  if length(v_tel) < 10 then return jsonb_build_object('error', 'Celular a 10 dígitos.'); end if;
  if coalesce(p_pin, '') !~ '^\d{4,6}$' then return jsonb_build_object('error', 'El PIN son 4 a 6 números.'); end if;
  insert into obra_miembros (obra_id, nombre, telefono, pin_hash, rol)
  values (p_obra, trim(p_nombre), v_tel, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
          case when p_rol = 'supervisor' then 'supervisor' else 'ejecutor' end)
  on conflict (obra_id, telefono) do update set nombre = excluded.nombre, rol = excluded.rol,
    pin_hash = excluded.pin_hash, activo = true, login_fails = 0, locked_until = null
  returning id into v_id;
  insert into obra_log (obra_id, miembro_id, usuario_id, actor, accion, despues)
  values (p_obra, v_id, auth.uid(), (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid()),
          'alta_miembro', jsonb_build_object('nombre', trim(p_nombre)));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.fn_obra_reset_pin(uuid, text) from public, anon;
revoke all on function public.fn_obra_alta_miembro(uuid, text, text, text, text) from public, anon;
grant execute on function public.fn_obra_alta_miembro(uuid, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
