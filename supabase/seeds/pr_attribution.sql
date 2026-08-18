-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · ATRIBUCIÓN PR — FASE 0 (cimientos)
--
-- El problema que resuelve: hoy nadie sabe qué reservas trajo cada relaciones
-- públicas, y por lo tanto nadie puede pagarle por resultado. Este módulo pone
-- una capa de IDENTIDAD DE ORIGEN sobre el flujo de reservas que ya existe —
-- no lo reemplaza.
--
-- PRINCIPIO RECTOR: el dinero solo se libera con eventos que el PR NO controla.
-- El host marca sentada (el PR no tiene ese permiso, y no por UI: por RLS).
-- El consumo llega del ticket. El gerente valida. Cada decisión de abajo se
-- deriva de eso.
--
--  · pr_profiles      quién es el PR, su código inmutable, su tier
--  · pr_attributions  qué reserva trajo quién, por qué canal y con qué factor
--  · pr_commissions   cuánto se le debe, con SNAPSHOT de la política del día
--  · pr_cupos         cuánto aforo puede ocupar el canal PR por venue y día
--  · pr_venue_config  tarifas, pisos, techos y multiplicadores POR VENUE
--  · fn_pr_attribute()  el motor de atribución (prioridades y reglas duras)
--
-- DECISIÓN DE DISEÑO vs. el brief: los estados CONSUMIDA y VALIDADA NO se
-- agregan a reservations.status. Una reserva termina en 'completed' (el cliente
-- se fue) — el consumo y la validación son estados del DINERO, y viven en
-- pr_commissions.estado. Meterlos en la reserva rompería los filtros, KPIs y
-- tableros que ya operan, y mezclaría dos ciclos de vida distintos.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Roles nuevos ────────────────────────────────────────────────────────────
-- PR: ve SOLO lo suyo. PR_MANAGER: coordina la red, resuelve disputas.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM',
                  'HEART_OF_HOUSE','DEV','PR','PR_MANAGER'));

-- ─── Helpers ─────────────────────────────────────────────────────────────────
-- Quién administra la red (alta/baja de PRs, cupos, disputas)
create or replace function public.fn_pr_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select hog_role() in ('MASTER','C_LEVEL','PR_MANAGER')
$$;

revoke all on function public.fn_pr_admin() from public;
grant execute on function public.fn_pr_admin() to authenticated;
-- fn_my_pr_id() se define DESPUÉS de pr_profiles: una función SQL valida su
-- cuerpo al crearse, así que no puede nombrar una tabla que aún no existe.

-- ─── PR_PROFILES — quién es el PR ────────────────────────────────────────────
-- Separado de profiles a propósito: un PR puede existir en la red ANTES de
-- tener cuenta (alta comercial primero, login después), y su historial de
-- atribución debe sobrevivir a que se le borre el usuario.
create table if not exists public.pr_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references profiles(id) on delete set null,
  full_name     text not null,
  phone         text check (phone ~ '^\+[1-9][0-9]{7,14}$'),   -- E.164, como guests
  email         text,
  -- El código es DICTABLE por teléfono: nada de hashes. {ALIAS}-{PLAZA}
  codigo        text not null unique
                check (codigo ~ '^[A-Z0-9]{3,12}-[A-Z]{2,8}$'),
  tier          text not null default 'aspirante'
                check (tier in ('aspirante','plata','oro','embajador')),
  tier_desde    date not null default current_date,
  plaza         text not null default 'mzt'
                check (plaza in ('mzt','cdmx','foraneo')),
  manager_id    uuid references pr_profiles(id) on delete set null,
  estatus       text not null default 'activo'
                check (estatus in ('activo','suspendido','baja')),
  datos_fiscales_ok boolean not null default false,
  -- Restricciones operativas (no monetarias): p.ej. bloqueo de fin de semana
  -- por show rate bajo. {"bloqueo_finde_hasta": "2026-09-15"}
  restricciones jsonb not null default '{}'::jsonb,
  qr_url        text,                                   -- QR generado en el alta
  notas         text,
  fecha_alta    date not null default current_date,
  fecha_baja    date,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_pr_codigo on pr_profiles (codigo);
create index if not exists idx_pr_user on pr_profiles (user_id) where user_id is not null;

-- El código es INMUTABLE y NUNCA se reasigna: la atribución histórica lo
-- referencia. Si el PR se va, el código muere con él.
create or replace function public.pr_codigo_inmutable() returns trigger
language plpgsql as $$
begin
  if new.codigo is distinct from old.codigo then
    raise exception 'El código PR es inmutable (% → %). La atribución histórica lo referencia.', old.codigo, new.codigo;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_pr_codigo on pr_profiles;
create trigger trg_pr_codigo before update on pr_profiles
  for each row execute function pr_codigo_inmutable();

-- El pr_id del usuario en sesión (null si no es PR). Vive aquí, después de la
-- tabla, porque una función SQL valida su cuerpo al momento de crearse.
create or replace function public.fn_my_pr_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from pr_profiles where user_id = auth.uid() and estatus = 'activo'
$$;
revoke all on function public.fn_my_pr_id() from public;
grant execute on function public.fn_my_pr_id() to authenticated;

-- ─── Campos nuevos sobre RESERVATIONS ────────────────────────────────────────
-- pax_sentado: lo que REALMENTE llegó (≠ party_size reservado). Es la base de
-- todo: piso de consumo por persona, multiplicador de mesa grande, y el KPI de
-- show rate honesto.
alter table reservations add column if not exists pax_sentado int check (pax_sentado >= 0);
alter table reservations add column if not exists mesa_ref    text;         -- para el match con el POS
alter table reservations add column if not exists consumo_neto numeric(12,2) check (consumo_neto >= 0);
alter table reservations add column if not exists ticket_pos_id text;
alter table reservations add column if not exists ticket_url  text;         -- foto del ticket (fallback POS)
alter table reservations add column if not exists consumo_por uuid references profiles(id) on delete set null;
alter table reservations add column if not exists consumo_at  timestamptz;

-- Sella quién y cuándo capturó el consumo — sin esto el fallback manual es
-- una caja negra, que es exactamente donde nace el fraude.
create or replace function public.reservation_consumo_stamp() returns trigger
language plpgsql as $$
begin
  if new.consumo_neto is distinct from old.consumo_neto and new.consumo_neto is not null then
    new.consumo_at  := coalesce(new.consumo_at, now());
    new.consumo_por := coalesce(new.consumo_por, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists trg_res_consumo on reservations;
create trigger trg_res_consumo before update on reservations
  for each row execute function reservation_consumo_stamp();

-- ─── PR_VENUE_CONFIG — la política, por venue, NO hardcodeada ───────────────
-- Un cambio de tarifa aquí jamás recalcula lo ya devengado: las comisiones
-- guardan su propio snapshot. Esta tabla solo afecta lo que se calcule después.
create table if not exists public.pr_venue_config (
  bu_id            uuid primary key references business_units(id) on delete cascade,
  activo           boolean not null default false,   -- el venue participa del programa
  -- Tarifa por tier (fracción, no porcentaje): 0.07 = 7%
  tarifa_aspirante numeric(5,4) not null default 0.05,
  tarifa_plata     numeric(5,4) not null default 0.07,
  tarifa_oro       numeric(5,4) not null default 0.09,
  tarifa_embajador numeric(5,4) not null default 0.10,
  -- Piso: consumo por persona sentada mínimo para que la comisión exista
  piso_por_persona numeric(10,2) not null default 0,
  -- Techo por reserva: arriba de esto requiere aprobación explícita
  techo_por_reserva numeric(10,2) not null default 5000,
  -- Días valle (0=domingo) que activan multiplicador
  dias_valle       int[] not null default '{}',
  mult_dia_valle   numeric(4,2) not null default 1.40,
  mult_cliente_nuevo numeric(4,2) not null default 1.15,
  mult_mesa_grande numeric(4,2) not null default 1.20,
  mesa_grande_desde int not null default 6,
  mult_tope        numeric(4,2) not null default 1.80,   -- tope combinado
  -- Cutoff: atribuciones después de esta hora, para el servicio del MISMO día,
  -- nacen con factor de manual. Configurable porque cada casa opera distinto.
  cutoff_hora      time not null default '13:00',
  -- La hora del cutoff es LOCAL DEL VENUE, no del servidor (Supabase corre en
  -- UTC): sin esto, un cutoff de 13:00 dispararía a las 06:00 en Mazatlán.
  zona_horaria     text not null default 'America/Mazatlan',
  -- Cuota fija por cover sentado, para casas SIN POS integrado (en vez de %)
  modo_cuota_fija  boolean not null default false,
  cuota_por_cover  numeric(10,2) not null default 0,
  updated_at       timestamptz not null default now()
);
drop trigger if exists trg_prcfg_touch on pr_venue_config;
create trigger trg_prcfg_touch before update on pr_venue_config
  for each row execute function touch_updated_at();

-- ─── PR_CUPOS — cuánto aforo puede ocupar el canal PR ───────────────────────
create table if not exists public.pr_cupos (
  id           uuid primary key default gen_random_uuid(),
  bu_id        uuid not null references business_units(id) on delete cascade,
  dia_semana   int not null check (dia_semana between 0 and 6),
  pct_aforo_pr int not null default 20 check (pct_aforo_pr between 0 and 100),
  -- Noches propias del venue: {"2026-09-15": 0}
  overrides_fecha jsonb not null default '{}'::jsonb,
  unique (bu_id, dia_semana)
);

-- ─── PR_ATTRIBUTIONS — quién trajo esta reserva ─────────────────────────────
-- UNIQUE(reservation_id) es el candado central del módulo: es IMPOSIBLE apilar
-- dos códigos sobre una reserva, y no por validación de UI — por constraint.
create table if not exists public.pr_attributions (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references reservations(id) on delete cascade,
  pr_id          uuid not null references pr_profiles(id),
  codigo_snapshot text not null,          -- el código al momento, por si el perfil cambia
  canal          text not null
                 check (canal in ('link','qr_personal','codigo_manual','qr_walkin','host_manual')),
  factor_atribucion numeric(3,2) not null check (factor_atribucion in (0, 0.50, 0.75, 1.00)),
  cliente_es_nuevo boolean,               -- se calcula al confirmar
  atribuido_por  uuid references profiles(id) on delete set null,  -- null = automático
  estado         text not null default 'activa'
                 check (estado in ('activa','rechazada','disputada','resuelta')),
  motivo_rechazo text,
  -- Por qué quedó con este factor (cutoff, tope de manuales, recurrente…)
  notas_motor    jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_prattr_pr on pr_attributions (pr_id, created_at desc);
create index if not exists idx_prattr_estado on pr_attributions (estado) where estado <> 'activa';

-- Log inmutable de cambios de atribución (append-only, sin update ni delete)
create table if not exists public.pr_attribution_log (
  id             uuid primary key default gen_random_uuid(),
  attribution_id uuid not null references pr_attributions(id) on delete cascade,
  antes          jsonb,
  despues        jsonb,
  actor          uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create or replace function public.pr_attr_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into pr_attribution_log (attribution_id, antes, despues, actor)
  values (new.id, to_jsonb(old), to_jsonb(new), auth.uid());
  return new;
end $$;
drop trigger if exists trg_prattr_audit on pr_attributions;
create trigger trg_prattr_audit after update on pr_attributions
  for each row execute function pr_attr_audit();

-- ─── PR_COMMISSIONS — el dinero, con snapshot de la política ────────────────
create table if not exists public.pr_commissions (
  id             uuid primary key default gen_random_uuid(),
  attribution_id uuid not null unique references pr_attributions(id) on delete cascade,
  reservation_id uuid not null references reservations(id) on delete cascade,
  pr_id          uuid not null references pr_profiles(id),
  bu_id          uuid not null references business_units(id),
  -- SNAPSHOT: qué política aplicaba el día que se devengó. Un cambio de tarifa
  -- a mitad de quincena jamás toca lo ya calculado.
  base_consumo_neto numeric(12,2) not null default 0,
  pax_sentado    int,
  tier_aplicado  text not null,
  tarifa_base    numeric(5,4) not null,
  factor_atribucion numeric(3,2) not null,
  multiplicadores jsonb not null default '[]'::jsonb,   -- [{"tipo":"dia_valle","factor":1.4}]
  reducciones    jsonb not null default '[]'::jsonb,
  tope_aplicado  boolean not null default false,
  monto          numeric(12,2) not null default 0,
  periodo_corte  text,                                  -- '2026-08-Q2'
  estado         text not null default 'calculada'
                 check (estado in ('calculada','validada','liberada','en_pago','pagada','retenida','rechazada')),
  -- Quién firmó qué y cuándo: [{"paso":"validada","por":"uuid","at":"..."}]
  validaciones   jsonb not null default '[]'::jsonb,
  motivo_rechazo text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_prcom_pr on pr_commissions (pr_id, periodo_corte);
create index if not exists idx_prcom_cola on pr_commissions (bu_id, estado) where estado = 'calculada';
drop trigger if exists trg_prcom_touch on pr_commissions;
create trigger trg_prcom_touch before update on pr_commissions
  for each row execute function touch_updated_at();

-- ═════════════════════════════════════════════════════════════════════════════
-- MOTOR DE ATRIBUCIÓN
-- Función pura, invocable desde la app y desde la edge function pública.
-- Devuelve la atribución creada o un error explicando por qué no.
-- ═════════════════════════════════════════════════════════════════════════════

-- ¿Es cliente nuevo del GRUPO? (no del venue) — ventana de 90 días.
-- guests.phone ya es E.164 por constraint, así que la dedup es confiable.
create or replace function public.fn_pr_cliente_nuevo(p_guest uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from guest_visits v
    where v.guest_id = p_guest
      and v.visit_date >= current_date - interval '90 days'
  )
$$;

-- El motor. Prioridades del brief §3, con las reglas duras aplicadas.
--   p_canal: 'link' | 'qr_personal' | 'codigo_manual' | 'qr_walkin' | 'host_manual'
create or replace function public.fn_pr_attribute(
  p_reservation uuid,
  p_codigo      text,
  p_canal       text default 'codigo_manual'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pr        pr_profiles%rowtype;
  v_res       reservations%rowtype;
  v_factor    numeric(3,2);
  v_cutoff    time;
  v_tz        text;
  v_ahora_local timestamp;
  v_notas     jsonb := '{}'::jsonb;
  v_manuales  int;
  v_total     int;
  v_estado    text := 'activa';
  v_nuevo     boolean;
  v_id        uuid;
begin
  select * into v_res from reservations where id = p_reservation;
  if not found then return jsonb_build_object('ok', false, 'error', 'Reserva no encontrada.'); end if;

  select * into v_pr from pr_profiles
   where upper(codigo) = upper(trim(p_codigo)) and estatus = 'activo';
  if not found then return jsonb_build_object('ok', false, 'error', 'Código PR no válido o dado de baja.'); end if;

  -- ANTI-RETROACTIVIDAD: una reserva ya sentada solo admite código por la vía
  -- del host, y dentro de los 15 minutos posteriores a la sentada.
  if v_res.seated_at is not null then
    if p_canal <> 'host_manual' then
      return jsonb_build_object('ok', false, 'error', 'La reserva ya fue sentada: solo el host puede atribuirla, dentro de 15 min.');
    end if;
    if now() - v_res.seated_at > interval '15 minutes' then
      return jsonb_build_object('ok', false, 'error', 'Pasaron más de 15 minutos desde la sentada — ya no se puede atribuir.');
    end if;
  end if;
  if v_res.status in ('completed','no_show','cancelled') then
    return jsonb_build_object('ok', false, 'error', 'La reserva ya cerró — no admite atribución.');
  end if;

  -- FACTOR BASE por canal (brief §3)
  v_factor := case p_canal
                when 'link'          then 1.00
                when 'qr_personal'   then 1.00
                when 'codigo_manual' then 1.00
                when 'host_manual'   then 0.75
                when 'qr_walkin'     then 0.50
                else 0 end;

  -- CUTOFF: después de la hora LOCAL DEL VENUE, para el servicio del MISMO
  -- día, una atribución "automática" vale lo mismo que una manual.
  select cutoff_hora, coalesce(zona_horaria, 'America/Mazatlan')
    into v_cutoff, v_tz
    from pr_venue_config where bu_id = v_res.bu_id;
  v_cutoff := coalesce(v_cutoff, '13:00');
  v_tz     := coalesce(v_tz, 'America/Mazatlan');
  v_ahora_local := timezone(v_tz, now());
  if v_res.date = v_ahora_local::date and v_ahora_local::time > v_cutoff and v_factor = 1.00 then
    v_factor := 0.75;
    v_notas := v_notas || jsonb_build_object('cutoff', true, 'cutoff_hora', v_cutoff::text);
  end if;

  -- CLIENTE RECURRENTE del grupo sin código propio → mitad de crédito
  v_nuevo := fn_pr_cliente_nuevo(v_res.guest_id);
  if not v_nuevo and p_canal in ('host_manual','qr_walkin') then
    v_factor := v_factor * 0.50;
    v_notas := v_notas || jsonb_build_object('recurrente', true);
  end if;

  -- AUTO-ATRIBUCIÓN: el PR reservando para sí mismo → factor 0, con bandera
  if v_pr.phone is not null and exists (
       select 1 from guests g where g.id = v_res.guest_id and g.phone = v_pr.phone) then
    v_factor := 0;
    v_estado := 'disputada';
    v_notas  := v_notas || jsonb_build_object('auto_atribucion', true);
  end if;

  -- TOPE DE MANUALES: arriba del 15% mensual, las manuales nacen en disputa
  if p_canal = 'host_manual' then
    select count(*) filter (where canal = 'host_manual'), count(*)
      into v_manuales, v_total
      from pr_attributions
     where pr_id = v_pr.id and created_at >= date_trunc('month', now());
    if v_total >= 10 and v_manuales::numeric / greatest(v_total,1) > 0.15 then
      v_estado := 'disputada';
      v_notas  := v_notas || jsonb_build_object('tope_manuales', true);
    end if;
  end if;

  -- BLOQUEO POR SHOW RATE: castigo operativo, no monetario
  if (v_pr.restricciones->>'bloqueo_finde_hasta') is not null
     and (v_pr.restricciones->>'bloqueo_finde_hasta')::date >= current_date
     and extract(dow from v_res.date) in (5,6) then
    return jsonb_build_object('ok', false, 'error', 'Este código tiene bloqueado viernes y sábado por show rate bajo.');
  end if;

  insert into pr_attributions (reservation_id, pr_id, codigo_snapshot, canal,
                               factor_atribucion, cliente_es_nuevo, atribuido_por, estado, notas_motor)
  values (p_reservation, v_pr.id, v_pr.codigo, p_canal,
          v_factor, v_nuevo,
          case when p_canal = 'host_manual' then auth.uid() else null end,
          v_estado, v_notas)
  on conflict (reservation_id) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'Esta reserva ya tiene un código asignado — no se pueden apilar.');
  end if;

  return jsonb_build_object('ok', true, 'attribution_id', v_id, 'factor', v_factor,
                            'estado', v_estado, 'pr', v_pr.full_name, 'codigo', v_pr.codigo,
                            'cliente_nuevo', v_nuevo, 'notas', v_notas);
end $$;

revoke all on function public.fn_pr_attribute(uuid, text, text) from public;
grant execute on function public.fn_pr_attribute(uuid, text, text) to authenticated;
grant execute on function public.fn_pr_cliente_nuevo(uuid) to authenticated;

-- ─── CUPO POR CANAL — cuánto aforo lleva ocupado el PR esa noche ────────────
create or replace function public.fn_pr_cupo(p_bu uuid, p_fecha date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_pct int; v_aforo int; v_ocupado int; v_override text;
begin
  select pct_aforo_pr, overrides_fecha->>p_fecha::text
    into v_pct, v_override
    from pr_cupos
   where bu_id = p_bu and dia_semana = extract(dow from p_fecha);
  if v_override is not null then v_pct := v_override::int; end if;
  v_pct := coalesce(v_pct, 20);

  select coalesce(max(max_pax), 0) into v_aforo
    from venue_capacity
   where bu_id = p_bu and day_of_week = extract(dow from p_fecha) and active;

  select coalesce(sum(r.party_size), 0) into v_ocupado
    from reservations r
    join pr_attributions a on a.reservation_id = r.id and a.estado = 'activa'
   where r.bu_id = p_bu and r.date = p_fecha
     and r.status in ('requested','confirmed','seated','completed');

  return jsonb_build_object(
    'pct', v_pct, 'aforo', v_aforo,
    'limite', floor(v_aforo * v_pct / 100.0),
    'ocupado', v_ocupado,
    'disponible', greatest(floor(v_aforo * v_pct / 100.0) - v_ocupado, 0));
end $$;
grant execute on function public.fn_pr_cupo(uuid, date) to authenticated, anon;

-- ═════════════════════════════════════════════════════════════════════════════
-- RLS — la matriz de permisos del brief §8.
-- Lo importante no es lo que cada rol puede: es lo que NO puede.
-- El PR jamás marca sentada, jamás ve clientes ajenos, jamás edita su tier.
-- ═════════════════════════════════════════════════════════════════════════════
alter table pr_profiles       enable row level security;
alter table pr_attributions   enable row level security;
alter table pr_commissions    enable row level security;
alter table pr_cupos          enable row level security;
alter table pr_venue_config   enable row level security;
alter table pr_attribution_log enable row level security;

-- PR_PROFILES: el PR se ve a sí mismo; la red la ven los admins; el staff de
-- piso ve nombre y código (para reconocer quién trajo la mesa).
drop policy if exists prp_select on pr_profiles;
create policy prp_select on pr_profiles for select to authenticated
  using (fn_pr_admin() or user_id = auth.uid()
         or hog_role() in ('OPS_MANAGER','TEAM','HEART_OF_HOUSE'));
drop policy if exists prp_write on pr_profiles;
create policy prp_write on pr_profiles for all to authenticated
  using (fn_pr_admin()) with check (fn_pr_admin());

-- ATRIBUCIONES: el PR ve las suyas. El piso ve las de su venue. Nadie las
-- borra: se rechazan o se disputan, y el log guarda todo.
drop policy if exists pra_select on pr_attributions;
create policy pra_select on pr_attributions for select to authenticated
  using (
    fn_pr_admin()
    or pr_id = fn_my_pr_id()
    or exists (select 1 from reservations r where r.id = reservation_id and hog_has_venue(r.bu_id))
  );
-- INSERT solo por el motor (security definer) o por piso/admin
drop policy if exists pra_insert on pr_attributions;
create policy pra_insert on pr_attributions for insert to authenticated
  with check (fn_pr_admin() or hog_role() in ('OPS_MANAGER','TEAM','HEART_OF_HOUSE'));
drop policy if exists pra_update on pr_attributions;
create policy pra_update on pr_attributions for update to authenticated
  using (fn_pr_admin() or exists (
    select 1 from reservations r where r.id = reservation_id
      and hog_role() = 'OPS_MANAGER' and hog_has_venue(r.bu_id)));

-- COMISIONES: el PR ve SOLO su monto. El gerente valida las de SU casa pero
-- no ve montos de otros PRs fuera de su venue. El host NO ve montos, punto.
drop policy if exists prc_select on pr_commissions;
create policy prc_select on pr_commissions for select to authenticated
  using (
    fn_pr_admin()
    or pr_id = fn_my_pr_id()
    or (hog_role() = 'OPS_MANAGER' and hog_has_venue(bu_id))
  );
drop policy if exists prc_write on pr_commissions;
create policy prc_write on pr_commissions for all to authenticated
  using (fn_pr_admin() or (hog_role() = 'OPS_MANAGER' and hog_has_venue(bu_id)))
  with check (fn_pr_admin() or (hog_role() = 'OPS_MANAGER' and hog_has_venue(bu_id)));

-- CUPOS y CONFIG: lectura amplia (el piso necesita saber si hay cupo),
-- escritura solo de quien fija política.
drop policy if exists prcup_select on pr_cupos;
create policy prcup_select on pr_cupos for select to authenticated using (true);
drop policy if exists prcup_write on pr_cupos;
create policy prcup_write on pr_cupos for all to authenticated
  using (hog_role() in ('MASTER','C_LEVEL')) with check (hog_role() in ('MASTER','C_LEVEL'));

drop policy if exists prcfg_select on pr_venue_config;
create policy prcfg_select on pr_venue_config for select to authenticated using (true);
drop policy if exists prcfg_write on pr_venue_config;
create policy prcfg_write on pr_venue_config for all to authenticated
  using (hog_role() in ('MASTER','C_LEVEL')) with check (hog_role() in ('MASTER','C_LEVEL'));

-- LOG: se lee, no se toca. Ni siquiera el Master lo edita.
drop policy if exists pralog_select on pr_attribution_log;
create policy pralog_select on pr_attribution_log for select to authenticated
  using (fn_pr_admin());

-- ─── Semilla de configuración: todos los venues, apagados ───────────────────
-- Nace inactivo a propósito: el programa se enciende venue por venue cuando
-- su operación (y su POS) están listos, no por default.
insert into pr_venue_config (bu_id, activo)
select id, false from business_units
on conflict (bu_id) do nothing;

insert into pr_cupos (bu_id, dia_semana, pct_aforo_pr)
select b.id, d.dow,
       case when d.dow in (5,6) then 15 else 25 end   -- finde apretado, entre semana abierto
  from business_units b cross join generate_series(0,6) as d(dow)
on conflict (bu_id, dia_semana) do nothing;
