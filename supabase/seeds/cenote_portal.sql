-- ═════════════════════════════════════════════════════════════════════════════
-- CENOTE · PORTAL COMERCIAL (salón por membresía + spa)
--
-- Desde noviembre Cenote deja de dar clases propias: renta el salón a
-- facilitadores por membresía y vende el spa. El portal público (/cenote)
-- vende las dos cosas, y este archivo es lo que lo respalda:
--
--   · cenote_catalogo       precios del salón y del spa. Son DATOS: subir el
--                           circuito de $500 a $550 es un update, no un deploy.
--   · cenote_facilitadores  embudo del facilitador: solicitud → acceso (le
--                           damos un código) → contratando (eligió plan y
--                           bloque, falta pago) → activo.
--   · cenote_pedidos        lo que se compra del spa: circuito, paquete,
--                           Recovery, masaje, ritual. Nace pendiente de pago.
--
-- REGLAS QUE VIVEN AQUÍ Y NO EN LA UI (el precio lo recalcula la base, nunca
-- se confía en el que manda el navegador):
--   · Código de facilitador → sus alumnos pagan el circuito a $350.
--   · Código FLOW → huésped del hotel, 10 % en todo el spa.
--   · No se acumulan descuentos.
--   · 2 personas por turno de circuito; el turno privado ocupa el turno entero.
--   · Recovery fundador: 10 lugares, precio congelado 6 meses.
--   · Facilitador que firma antes del 31 dic 2026: precio congelado 6 meses.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Requiere wellness.sql (fn_can_wellness / fn_wellness_admin).
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1. Catálogo ─────────────────────────────────────────────────────────────
create table if not exists cenote_catalogo (
  code          text primary key,
  -- salon | spa
  linea         text not null,
  -- membresia | evento | extra | circuito | paquete | recovery | masaje | ritual | privado
  grupo         text not null,
  nombre        text not null,
  detalle       text,
  precio        numeric(10,2) not null,
  unidad        text,
  -- Salón: horas de clase al mes que incluye la membresía
  horas_mes     int,
  -- Spa: lugares del turno de circuito que ocupa (0 = no usa el circuito)
  lugares       int not null default 0,
  -- Spa: si al comprarlo se elige fecha y turno
  agenda        boolean not null default false,
  -- Tope de compras vivas (Recovery fundador: 10). NULL = sin tope.
  cupo_total    int,
  destacado     boolean not null default false,
  orden         int not null default 0,
  activo        boolean not null default true
);

insert into cenote_catalogo
  (code, linea, grupo, nombre, detalle, precio, unidad, horas_mes, lugares, agenda, cupo_total, destacado, orden)
values
  -- Salón
  ('base',      'salon', 'membresia', 'Base',  '8 h de clase al mes. Un bloque fijo de 2 h por semana.',        2500, 'al mes', 8,  0, false, null, false, 10),
  ('plus',      'salon', 'membresia', 'Plus',  '16 h al mes. Dos bloques fijos por semana.',                    4500, 'al mes', 16, 0, false, null, true,  20),
  ('pro',       'salon', 'membresia', 'Pro',   '24 h al mes. Tres bloques fijos: tu estudio sin tener estudio.', 6000, 'al mes', 24, 0, false, null, false, 30),
  ('evento',    'salon', 'evento',    'Evento o taller', 'Sin membresía. Mínimo 2 horas.',                        1000, 'por hora', null, 0, false, null, false, 40),
  ('hora_extra','salon', 'extra',     'Hora extra',      'Para miembros, sobre su plan.',                          350, 'por hora', null, 0, false, null, false, 50),
  -- Spa
  ('circuito',  'spa', 'circuito', 'Circuito',             'Sauna, vapor y cold plunge, a tu ritmo. 75 min. Incluye toalla y agua.', 500, null, null, 1, true, null, true, 110),
  ('pareja',    'spa', 'circuito', 'Circuito en pareja',   'El turno completo para dos.',                                900, null, null, 2, true, null, false, 120),
  ('paq4',      'spa', 'paquete',  'Paquete 4',            'Cuatro circuitos. Vigencia 60 días, transferible.',        1800, null, null, 0, false, null, false, 130),
  ('paq8',      'spa', 'paquete',  'Paquete 8',            'Ocho circuitos. Vigencia 90 días, transferible.',          3200, null, null, 0, false, null, true, 140),
  ('recovery_fundador', 'spa', 'recovery', 'Recovery Fundador', 'Un circuito al día, todos los días. Congelado 6 meses. Cargo automático, sin permanencia.', 2299, 'al mes', null, 0, false, 10, true, 150),
  ('recovery',  'spa', 'recovery', 'Recovery',             'Un circuito al día, todos los días. Cargo automático, sin permanencia.', 2900, 'al mes', null, 0, false, null, false, 160),
  ('relajante', 'spa', 'masaje',   'Masaje relajante · 60 min',        'Presión suave a media para soltar el día.',         1300, null, null, 0, true, null, false, 210),
  ('descontracturante', 'spa', 'masaje', 'Masaje descontracturante · 60 min', 'Presión profunda en espalda, cuello y hombros.', 1500, null, null, 0, true, null, false, 220),
  ('masaje90',  'spa', 'masaje',   'Masaje · 90 min',                  'Relajante o descontracturante, cuerpo completo.',  1900, null, null, 0, true, null, false, 230),
  ('reset',     'spa', 'ritual',   'Reset',          'Circuito + masaje relajante 60 min.',              1600, null, null, 1, true, null, true, 310),
  ('reset_deep','spa', 'ritual',   'Reset Deep',     'Circuito + masaje descontracturante 60 min.',      1800, null, null, 1, true, null, false, 320),
  ('reset_pareja','spa','ritual',  'Reset en pareja','Dos circuitos + dos masajes de 60 min.',           3000, null, null, 2, true, null, false, 330),
  ('dia_cenote','spa', 'ritual',   'Día Cenote',     'Circuito + masaje de 90 min + bebida.',            2100, null, null, 1, true, null, false, 340),
  ('privado',   'spa', 'privado',  'Turno privado · 3 o 4 personas', '90 min con el spa solo para ustedes.', 1800, null, null, 2, true, null, false, 410)
on conflict (code) do update set
  linea = excluded.linea, grupo = excluded.grupo, nombre = excluded.nombre,
  detalle = excluded.detalle, precio = excluded.precio, unidad = excluded.unidad,
  horas_mes = excluded.horas_mes, lugares = excluded.lugares, agenda = excluded.agenda,
  cupo_total = excluded.cupo_total, destacado = excluded.destacado, orden = excluded.orden;

-- ─── 2. Facilitadores ────────────────────────────────────────────────────────
create table if not exists cenote_facilitadores (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  telefono      text not null,
  correo        text,
  disciplina    text,
  alumnos       int,
  donde_hoy     text,
  plan_interes  text,
  horario_pref  text,
  -- solicitud | acceso | contratando | activo | descartado
  status        text not null default 'solicitud',
  -- Lo da el equipo al abrirle acceso. Es también el código de sus alumnos
  -- para el circuito a $350, por eso es corto y legible (ALMA, RAFA22).
  codigo        text unique,
  bloque        text,
  plan_code     text references cenote_catalogo(code),
  deposito      numeric(10,2),
  primer_mes    numeric(10,2),
  precio_congelado_hasta date,
  notas         text,
  created_at    timestamptz not null default now(),
  acceso_at     timestamptz,
  contratado_at timestamptz,
  activo_at     timestamptz
);
create index if not exists cenote_facilitadores_tel_idx on cenote_facilitadores (telefono);

-- ─── 3. Pedidos del spa ──────────────────────────────────────────────────────
create table if not exists cenote_pedidos (
  id            uuid primary key default gen_random_uuid(),
  folio         text unique,
  producto_code text not null references cenote_catalogo(code),
  producto      text not null,
  nombre        text not null,
  telefono      text not null,
  correo        text,
  fecha         date,
  turno         text,
  lugares       int not null default 0,
  codigo        text,
  -- alumno | flow | NULL
  tipo_desc     text,
  facilitador_id uuid references cenote_facilitadores(id),
  habitacion    text,
  precio_lista  numeric(10,2) not null,
  descuento     numeric(10,2) not null default 0,
  total         numeric(10,2) not null,
  -- pendiente_pago | pagado | cancelado
  status        text not null default 'pendiente_pago',
  paid_via      text,
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists cenote_pedidos_turno_idx on cenote_pedidos (fecha, turno) where status <> 'cancelado';

create or replace function public.fn_cenote_folio()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  -- El mismo alfabeto de los tickets de wellness: sin 0/O/1/I/L, se dicta en caja.
  v_alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v text;
begin
  if new.folio is null then
    for _intento in 1..20 loop
      v := 'CEN-';
      for i in 1..5 loop
        v := v || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
      end loop;
      if not exists (select 1 from cenote_pedidos where folio = v) then
        new.folio := v; return new;
      end if;
    end loop;
    raise exception 'No se pudo generar un folio único después de 20 intentos';
  end if;
  return new;
end $fn$;

drop trigger if exists trg_cenote_folio on cenote_pedidos;
create trigger trg_cenote_folio before insert on cenote_pedidos
  for each row execute function public.fn_cenote_folio();

-- ─── 4. RLS: el público entra solo por RPC; el equipo, como en wellness ──────
alter table cenote_catalogo      enable row level security;
alter table cenote_facilitadores enable row level security;
alter table cenote_pedidos       enable row level security;

do $g$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    drop policy if exists cenote_catalogo_sel on cenote_catalogo;
    drop policy if exists cenote_catalogo_wr  on cenote_catalogo;
    drop policy if exists cenote_fac_sel on cenote_facilitadores;
    drop policy if exists cenote_fac_wr  on cenote_facilitadores;
    drop policy if exists cenote_ped_sel on cenote_pedidos;
    drop policy if exists cenote_ped_wr  on cenote_pedidos;
    create policy cenote_catalogo_sel on cenote_catalogo for select to authenticated using (fn_can_wellness());
    create policy cenote_catalogo_wr  on cenote_catalogo for all to authenticated using (fn_wellness_admin()) with check (fn_wellness_admin());
    create policy cenote_fac_sel on cenote_facilitadores for select to authenticated using (fn_can_wellness());
    create policy cenote_fac_wr  on cenote_facilitadores for all to authenticated using (fn_wellness_admin()) with check (fn_wellness_admin());
    create policy cenote_ped_sel on cenote_pedidos for select to authenticated using (fn_can_wellness());
    create policy cenote_ped_wr  on cenote_pedidos for all to authenticated using (fn_wellness_admin()) with check (fn_wellness_admin());
  end if;
end $g$;

-- ─── 5. RPCs públicas ────────────────────────────────────────────────────────

-- Catálogo vigente, con los lugares de fundador que quedan.
create or replace function public.fn_cenote_catalogo()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', c.code, 'linea', c.linea, 'grupo', c.grupo, 'nombre', c.nombre,
    'detalle', c.detalle, 'precio', c.precio, 'unidad', c.unidad,
    'horas_mes', c.horas_mes, 'lugares', c.lugares, 'agenda', c.agenda,
    'destacado', c.destacado,
    'disponibles', case when c.cupo_total is null then null else greatest(0, c.cupo_total - (
      select count(*) from cenote_pedidos p
       where p.producto_code = c.code and p.status <> 'cancelado')) end
  ) order by c.orden), '[]'::jsonb)
  from cenote_catalogo c where c.activo
$$;

-- Lugares ocupados por turno de circuito en un día.
create or replace function public.fn_cenote_turnos(p_fecha date)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(turno, ocupados), '{}'::jsonb) from (
    select turno, sum(lugares)::int as ocupados from cenote_pedidos
     where fecha = p_fecha and status <> 'cancelado' and lugares > 0
     group by turno
  ) t
$$;

-- Un facilitador pide entrar. Si ya había pedido con ese teléfono y sigue en
-- solicitud, se actualiza en lugar de duplicarse.
create or replace function public.fn_cenote_solicitud(
  p_nombre text, p_telefono text, p_correo text, p_disciplina text,
  p_alumnos int, p_donde text, p_plan text, p_horario text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'); v_id uuid;
begin
  if length(trim(coalesce(p_nombre, ''))) < 2 then return jsonb_build_object('ok', false, 'error', 'Escribe tu nombre.'); end if;
  if length(v_tel) < 10 then return jsonb_build_object('ok', false, 'error', 'Revisa tu WhatsApp: deben ser 10 dígitos.'); end if;
  select id into v_id from cenote_facilitadores where telefono = v_tel and status = 'solicitud' limit 1;
  if v_id is null then
    insert into cenote_facilitadores (nombre, telefono, correo, disciplina, alumnos, donde_hoy, plan_interes, horario_pref)
    values (trim(p_nombre), v_tel, nullif(trim(p_correo), ''), nullif(trim(p_disciplina), ''), p_alumnos,
            nullif(trim(p_donde), ''), nullif(p_plan, ''), nullif(trim(p_horario), ''))
    returning id into v_id;
  else
    update cenote_facilitadores set nombre = trim(p_nombre), correo = nullif(trim(p_correo), ''),
      disciplina = nullif(trim(p_disciplina), ''), alumnos = p_alumnos, donde_hoy = nullif(trim(p_donde), ''),
      plan_interes = nullif(p_plan, ''), horario_pref = nullif(trim(p_horario), '')
     where id = v_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- El facilitador entra con el código que le dimos.
create or replace function public.fn_cenote_acceso(p_codigo text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object(
    'ok', true, 'nombre', f.nombre, 'codigo', f.codigo, 'status', f.status,
    'disciplina', f.disciplina, 'bloque', f.bloque,
    'plan_code', coalesce(f.plan_code, f.plan_interes),
    'deposito', f.deposito, 'primer_mes', f.primer_mes,
    'precio_congelado_hasta', f.precio_congelado_hasta)
    from cenote_facilitadores f
   where upper(f.codigo) = upper(trim(p_codigo))
     and f.status in ('acceso', 'contratando', 'activo')),
  jsonb_build_object('ok', false, 'error', 'Ese código no está activo. Pídelo a tu contacto en Cenote.'))
$$;

-- Elige plan y confirma bloque. Queda "contratando" hasta que el equipo
-- registre depósito, primer mes y contrato firmado.
create or replace function public.fn_cenote_contratar(p_codigo text, p_plan text, p_bloque text, p_acepta boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f cenote_facilitadores; c cenote_catalogo; v_congela date;
begin
  select * into f from cenote_facilitadores
   where upper(codigo) = upper(trim(p_codigo)) and status in ('acceso', 'contratando');
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'Ese código no está activo.'); end if;
  select * into c from cenote_catalogo where code = p_plan and linea = 'salon' and grupo = 'membresia' and activo;
  if c.code is null then return jsonb_build_object('ok', false, 'error', 'Elige una membresía.'); end if;
  if not coalesce(p_acepta, false) then return jsonb_build_object('ok', false, 'error', 'Acepta las reglas del espacio para continuar.'); end if;
  if length(trim(coalesce(p_bloque, ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'Indica el día y la hora de tu bloque.'); end if;
  v_congela := case when current_date <= date '2026-12-31' then (current_date + interval '6 months')::date end;
  update cenote_facilitadores set plan_code = c.code, bloque = trim(p_bloque), status = 'contratando',
         deposito = 2500, primer_mes = c.precio, precio_congelado_hasta = v_congela, contratado_at = now()
   where id = f.id;
  return jsonb_build_object('ok', true, 'plan', c.nombre, 'precio', c.precio, 'deposito', 2500,
    'total', 2500 + c.precio, 'bloque', trim(p_bloque), 'codigo', f.codigo,
    'precio_congelado_hasta', v_congela);
end $$;

-- ¿Qué descuento da un código? Facilitador → alumno; FLOW → huésped.
create or replace function public.fn_cenote_codigo(p_codigo text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when upper(trim(coalesce(p_codigo, ''))) = 'FLOW' then
      jsonb_build_object('ok', true, 'tipo', 'flow', 'pct', 10, 'etiqueta', 'Huésped Hotel Flow · 10 %')
    else coalesce((select jsonb_build_object('ok', true, 'tipo', 'alumno', 'circuito', 350,
                     'etiqueta', 'Alumno de ' || split_part(f.nombre, ' ', 1) || ' · circuito $350')
                     from cenote_facilitadores f
                    where upper(f.codigo) = upper(trim(p_codigo)) and f.status in ('contratando', 'activo')),
                  jsonb_build_object('ok', false, 'error', 'Código no válido.'))
  end
$$;

-- Compra del spa. El precio se calcula aquí.
create or replace function public.fn_cenote_spa_pedido(
  p_producto text, p_nombre text, p_telefono text, p_correo text,
  p_fecha date, p_turno text, p_codigo text, p_habitacion text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c cenote_catalogo; v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_cod jsonb; v_desc numeric := 0; v_tipo text; v_fac uuid; v_ocup int; v_vendidos int;
  v_turnos text[] := array['10:00','11:30','13:00','14:30','16:00','17:30','19:00'];
  r cenote_pedidos;
begin
  select * into c from cenote_catalogo where code = p_producto and linea = 'spa' and activo;
  if c.code is null then return jsonb_build_object('ok', false, 'error', 'Ese producto ya no está disponible.'); end if;
  if length(trim(coalesce(p_nombre, ''))) < 2 then return jsonb_build_object('ok', false, 'error', 'Escribe tu nombre.'); end if;
  if length(v_tel) < 10 then return jsonb_build_object('ok', false, 'error', 'Revisa tu WhatsApp: deben ser 10 dígitos.'); end if;

  if c.agenda then
    if p_fecha is null or p_fecha < current_date then return jsonb_build_object('ok', false, 'error', 'Elige una fecha.'); end if;
    if not (p_turno = any(v_turnos)) then return jsonb_build_object('ok', false, 'error', 'Elige un turno.'); end if;
    if c.lugares > 0 then
      select coalesce(sum(lugares), 0) into v_ocup from cenote_pedidos
       where fecha = p_fecha and turno = p_turno and status <> 'cancelado';
      if v_ocup + c.lugares > 2 then
        return jsonb_build_object('ok', false, 'error', 'Ese turno ya se llenó. Elige otro.');
      end if;
    end if;
  end if;

  if c.cupo_total is not null then
    select count(*) into v_vendidos from cenote_pedidos where producto_code = c.code and status <> 'cancelado';
    if v_vendidos >= c.cupo_total then return jsonb_build_object('ok', false, 'error', 'Ya no quedan lugares de fundador.'); end if;
  end if;

  if nullif(trim(coalesce(p_codigo, '')), '') is not null then
    v_cod := fn_cenote_codigo(p_codigo);
    if (v_cod->>'ok')::boolean then
      v_tipo := v_cod->>'tipo';
      if v_tipo = 'flow' then
        v_desc := round(c.precio * 0.10);
      elsif v_tipo = 'alumno' and c.code = 'circuito' then
        v_desc := c.precio - 350;
        select id into v_fac from cenote_facilitadores where upper(codigo) = upper(trim(p_codigo));
      else
        v_tipo := null;  -- el código de alumno solo aplica al circuito individual
      end if;
    end if;
  end if;

  insert into cenote_pedidos (producto_code, producto, nombre, telefono, correo, fecha, turno, lugares,
    codigo, tipo_desc, facilitador_id, habitacion, precio_lista, descuento, total)
  values (c.code, c.nombre, trim(p_nombre), v_tel, nullif(trim(p_correo), ''),
    case when c.agenda then p_fecha end, case when c.agenda then p_turno end,
    case when c.agenda then c.lugares else 0 end,
    case when v_tipo is not null then upper(trim(p_codigo)) end, v_tipo, v_fac,
    nullif(trim(p_habitacion), ''), c.precio, v_desc, c.precio - v_desc)
  returning * into r;

  return jsonb_build_object('ok', true, 'folio', r.folio, 'producto', r.producto,
    'fecha', r.fecha, 'turno', r.turno, 'precio_lista', r.precio_lista,
    'descuento', r.descuento, 'total', r.total, 'tipo_desc', r.tipo_desc);
end $$;

do $g$ begin
  revoke all on function public.fn_cenote_catalogo() from public;
  revoke all on function public.fn_cenote_turnos(date) from public;
  revoke all on function public.fn_cenote_solicitud(text, text, text, text, int, text, text, text) from public;
  revoke all on function public.fn_cenote_acceso(text) from public;
  revoke all on function public.fn_cenote_contratar(text, text, text, boolean) from public;
  revoke all on function public.fn_cenote_codigo(text) from public;
  revoke all on function public.fn_cenote_spa_pedido(text, text, text, text, date, text, text, text) from public;
  grant execute on function public.fn_cenote_catalogo() to anon, authenticated;
  grant execute on function public.fn_cenote_turnos(date) to anon, authenticated;
  grant execute on function public.fn_cenote_solicitud(text, text, text, text, int, text, text, text) to anon, authenticated;
  grant execute on function public.fn_cenote_acceso(text) to anon, authenticated;
  grant execute on function public.fn_cenote_contratar(text, text, text, boolean) to anon, authenticated;
  grant execute on function public.fn_cenote_codigo(text) to anon, authenticated;
  grant execute on function public.fn_cenote_spa_pedido(text, text, text, text, date, text, text, text) to anon, authenticated;
end $g$;

notify pgrst, 'reload schema';
