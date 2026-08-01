-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Curva de ocupación (esquema) + Ajuste del sábado ROOF (Oyster CLUB)
-- Parte 1 (permanente): duration_min y proposed_time en reservas + motor
--   actualizado para respetar la duración por reserva. Idempotente.
-- Parte 2 (una vez): ajustes B1-B4 a las reservas del sábado 2026-08-01 en OC.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1a. Esquema: duración por reserva + propuesta de cambio de horario ──────
alter table reservations add column if not exists duration_min  int;   -- override; sin valor usa la duración del venue por tamaño de grupo
alter table reservations add column if not exists proposed_time text;  -- 'HH:MM' propuesto, pendiente de confirmación del cliente

-- ─── 1b. Motor: respetar duration_min de cada reserva ────────────────────────
create or replace function public.fn_available_slots(p_bu uuid, p_date date, p_pax int, p_online boolean default false)
returns table(slot text, libres int)
language plpgsql stable security definer set search_path = public
as $$
declare
  s venue_reservation_settings%rowtype;
  v_cap record;
  v_open int; v_close int; v_dur int; v_free int; v_slot_pax int;
  v_total_cap int; v_online_used int;
  m int;
begin
  select * into s from venue_reservation_settings where bu_id = p_bu;
  if not found or s.engine <> 'tables' then return; end if;
  if p_online and p_pax > s.online_max_pax then return; end if;

  select vc.open_time, vc.close_time into v_cap
    from venue_capacity vc
    where vc.bu_id = p_bu and vc.day_of_week = extract(dow from p_date)::int and vc.active;
  if not found or v_cap.open_time is null or v_cap.close_time is null then return; end if;

  v_open  := split_part(v_cap.open_time, ':', 1)::int * 60 + split_part(v_cap.open_time, ':', 2)::int;
  v_close := split_part(v_cap.close_time, ':', 1)::int * 60 + split_part(v_cap.close_time, ':', 2)::int;
  if v_close <= v_open then v_close := v_close + 1440; end if;

  select coalesce(min((d->>'minutes')::int), 120) into v_dur
    from jsonb_array_elements(s.durations) d
    where (d->>'max_pax')::int >= p_pax;

  if p_online and s.online_pct < 100 then
    select coalesce(sum(t.max_pax), 0) into v_total_cap
      from venue_tables t join venue_zones z on z.id = t.zone_id
      where t.bu_id = p_bu and t.active and z.status = 'active';
    select coalesce(sum(r.party_size), 0) into v_online_used
      from reservations r
      where r.bu_id = p_bu and r.date = p_date
        and r.status in ('requested','confirmed','seated')
        and r.source in ('web','whatsapp','instagram');
    if v_online_used + p_pax > floor(v_total_cap * s.online_pct / 100.0) then return; end if;
  end if;

  for m in select generate_series(v_open, v_close - v_dur, s.slot_minutes) loop
    if s.pacing_max_pax > 0 then
      select coalesce(sum(r.party_size), 0) into v_slot_pax
        from reservations r
        where r.bu_id = p_bu and r.date = p_date
          and r.status in ('requested','confirmed','seated')
          and fn_slot_min(r.time_slot, v_open) >= m
          and fn_slot_min(r.time_slot, v_open) < m + s.slot_minutes;
      if v_slot_pax + p_pax > s.pacing_max_pax then continue; end if;
    end if;

    select count(*) into v_free from (
      with busy as (
        select bt.tid from (
          select unnest(coalesce(tc.table_ids, array[r.table_id])) as tid,
                 fn_slot_min(r.time_slot, v_open) as rstart,
                 coalesce(r.duration_min,
                          (select min((d->>'minutes')::int) from jsonb_array_elements(s.durations) d
                           where (d->>'max_pax')::int >= r.party_size), 120) as rdur
          from reservations r
          left join table_combinations tc on tc.id = r.combo_id
          where r.bu_id = p_bu and r.date = p_date
            and r.status in ('requested','confirmed','seated')
            and (r.table_id is not null or r.combo_id is not null)
        ) bt
        where bt.rstart < m + v_dur + s.buffer_minutes
          and bt.rstart + bt.rdur + s.buffer_minutes > m
      )
      select t.id
        from venue_tables t join venue_zones z on z.id = t.zone_id
        where t.bu_id = p_bu and t.active and z.status = 'active'
          and (not p_online or z.reservable_online)
          and t.min_pax <= p_pax and t.max_pax >= p_pax
          and t.id not in (select tid from busy)
      union all
      select tc.id
        from table_combinations tc join venue_zones z on z.id = tc.zone_id
        where tc.bu_id = p_bu and z.status = 'active'
          and (not p_online or z.reservable_online)
          and tc.min_pax <= p_pax and tc.max_pax >= p_pax
          and not exists (select 1 from unnest(tc.table_ids) u(tid) where u.tid in (select tid from busy))
    ) f;

    if v_free > 0 then
      slot := to_char(make_time(((m / 60) % 24)::int, (m % 60)::int, 0), 'HH24:MI');
      libres := v_free;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.fn_assign_table(p_bu uuid, p_date date, p_slot text, p_pax int, p_online boolean default false)
returns table(table_id uuid, combo_id uuid, zone_id uuid, nombre text)
language plpgsql stable security definer set search_path = public
as $$
declare
  s venue_reservation_settings%rowtype;
  v_cap record;
  v_open int; v_close int; v_dur int; v_slot_pax int; m int;
  v_total_cap int; v_online_used int;
begin
  select * into s from venue_reservation_settings where bu_id = p_bu;
  if not found or s.engine <> 'tables' then return; end if;
  if p_online and p_pax > s.online_max_pax then return; end if;

  select vc.open_time, vc.close_time into v_cap
    from venue_capacity vc
    where vc.bu_id = p_bu and vc.day_of_week = extract(dow from p_date)::int and vc.active;
  if not found or v_cap.open_time is null or v_cap.close_time is null then return; end if;

  v_open  := split_part(v_cap.open_time, ':', 1)::int * 60 + split_part(v_cap.open_time, ':', 2)::int;
  v_close := split_part(v_cap.close_time, ':', 1)::int * 60 + split_part(v_cap.close_time, ':', 2)::int;
  if v_close <= v_open then v_close := v_close + 1440; end if;

  select coalesce(min((d->>'minutes')::int), 120) into v_dur
    from jsonb_array_elements(s.durations) d
    where (d->>'max_pax')::int >= p_pax;

  m := fn_slot_min(p_slot, v_open);
  if m < v_open or m > v_close - v_dur then return; end if;

  if p_online and s.online_pct < 100 then
    select coalesce(sum(t.max_pax), 0) into v_total_cap
      from venue_tables t join venue_zones z on z.id = t.zone_id
      where t.bu_id = p_bu and t.active and z.status = 'active';
    select coalesce(sum(r.party_size), 0) into v_online_used
      from reservations r
      where r.bu_id = p_bu and r.date = p_date
        and r.status in ('requested','confirmed','seated')
        and r.source in ('web','whatsapp','instagram');
    if v_online_used + p_pax > floor(v_total_cap * s.online_pct / 100.0) then return; end if;
  end if;

  if s.pacing_max_pax > 0 then
    select coalesce(sum(r.party_size), 0) into v_slot_pax
      from reservations r
      where r.bu_id = p_bu and r.date = p_date
        and r.status in ('requested','confirmed','seated')
        and fn_slot_min(r.time_slot, v_open) >= m - (m % s.slot_minutes)
        and fn_slot_min(r.time_slot, v_open) < m - (m % s.slot_minutes) + s.slot_minutes;
    if v_slot_pax + p_pax > s.pacing_max_pax then return; end if;
  end if;

  return query
  with busy as (
    select bt.tid from (
      select unnest(coalesce(tc.table_ids, array[r.table_id])) as tid,
             fn_slot_min(r.time_slot, v_open) as rstart,
             coalesce(r.duration_min,
                      (select min((d->>'minutes')::int) from jsonb_array_elements(s.durations) d
                       where (d->>'max_pax')::int >= r.party_size), 120) as rdur
      from reservations r
      left join table_combinations tc on tc.id = r.combo_id
      where r.bu_id = p_bu and r.date = p_date
        and r.status in ('requested','confirmed','seated')
        and (r.table_id is not null or r.combo_id is not null)
    ) bt
    where bt.rstart < m + v_dur + s.buffer_minutes
      and bt.rstart + bt.rdur + s.buffer_minutes > m
  ),
  opciones as (
    select t.id as tid, null::uuid as cid, t.zone_id as zid, t.name as nm,
           z.priority as prio, t.max_pax as cap, 0 as pref
      from venue_tables t join venue_zones z on z.id = t.zone_id
      where t.bu_id = p_bu and t.active and z.status = 'active'
        and (not p_online or z.reservable_online)
        and t.min_pax <= p_pax and t.max_pax >= p_pax
        and t.id not in (select tid from busy)
    union all
    select null::uuid, tc.id, tc.zone_id, tc.name,
           z.priority, tc.max_pax, 1
      from table_combinations tc join venue_zones z on z.id = tc.zone_id
      where tc.bu_id = p_bu and z.status = 'active'
        and (not p_online or z.reservable_online)
        and tc.min_pax <= p_pax and tc.max_pax >= p_pax
        and not exists (select 1 from unnest(tc.table_ids) u(tid) where u.tid in (select tid from busy))
  )
  select o.tid, o.cid, o.zid, o.nm
    from opciones o
    order by o.pref, o.prio, o.cap
    limit 1;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. AJUSTE ÚNICO — sábado 2026-08-01 · Oyster CLUB (ROOF)
-- ═════════════════════════════════════════════════════════════════════════════

-- Parámetros del venue (regla de oro): 2-4 pax = 120 min, 5+ = 180, buffer 15
insert into venue_reservation_settings (bu_id, slot_minutes, durations, buffer_minutes)
select id, 30, '[{"max_pax":4,"minutes":120},{"max_pax":99,"minutes":180}]'::jsonb, 15
from business_units where code = 'OC'
on conflict (bu_id) do update
  set durations = excluded.durations, buffer_minutes = excluded.buffer_minutes;

-- B1. Duraciones por reserva (PR = 180 aunque sean 4 pax)
update reservations r
set duration_min = case when r.party_size >= 5 then 180 else 120 end
where r.bu_id = (select id from business_units where code = 'OC')
  and r.date = '2026-08-01' and r.status in ('requested','confirmed');

update reservations r
set duration_min = 180
where r.bu_id = (select id from business_units where code = 'OC')
  and r.date = '2026-08-01' and r.notes ilike '%MESA PR%';

-- B2. Cambios de zona (se aplican ya): Chucho y Sofi a Barra
update reservations r
set zone = 'Barra'
from guests g
where g.id = r.guest_id
  and r.bu_id = (select id from business_units where code = 'OC')
  and r.date = '2026-08-01'
  and g.phone in ('+5266100000005',  -- Chucho Pedroza
                  '+5266100000012'); -- Sofi Kova

-- B3. Propuestas de cambio de horario (NO se aplican — quedan pendientes de
--     confirmación; en el app aparecen en ámbar con botones aceptó/no aceptó)
update reservations r set proposed_time = p.nueva
from (values ('+5266100000018', '13:30'),   -- Daniela Blanco  15:00 → 13:30
             ('+5266100000001', '16:30'),   -- José Carlos     15:00 → 16:30
             ('+5266100000007', '17:30'))   -- Chris Elysse    15:00 → 17:30
     as p(tel, nueva), guests g
where g.phone = p.tel and g.id = r.guest_id
  and r.bu_id = (select id from business_units where code = 'OC')
  and r.date = '2026-08-01' and r.status in ('requested','confirmed');

-- B4. Depósito requerido para grupos de 6+ (nota visible al equipo)
update reservations r
set notes = coalesce(nullif(trim(r.notes), '') || ' · ', '') || 'Depósito requerido (grupo 6+) — pendiente'
where r.bu_id = (select id from business_units where code = 'OC')
  and r.date = '2026-08-01' and r.status in ('requested','confirmed')
  and r.party_size >= 6
  and coalesce(r.notes, '') not ilike '%Depósito requerido%';

-- B5. Asignación de mesa física — solo corre si OC ya tiene piso + motor
-- por mesas activo (engine='tables' y mesas en el editor). Si no, avisa y salta.
do $$
declare
  v_bu uuid;
  v_engine text;
  v_tablas int;
  r record;
  asg record;
  sin_mesa int := 0;
begin
  select id into v_bu from business_units where code = 'OC';
  select engine into v_engine from venue_reservation_settings where bu_id = v_bu;
  select count(*) into v_tablas from venue_tables where bu_id = v_bu and active;
  if v_engine is distinct from 'tables' or v_tablas = 0 then
    raise notice 'B5 SALTADO: OC necesita piso configurado (mesas en el Editor de piso) y el switch Motor por mesas encendido. engine=%, mesas activas=%', coalesce(v_engine,'—'), v_tablas;
    return;
  end if;
  for r in
    select res.id, res.time_slot, res.party_size from reservations res
    where res.bu_id = v_bu and res.date = '2026-08-01'
      and res.status in ('requested','confirmed')
      and res.table_id is null and res.combo_id is null
      and coalesce(res.zone, '') <> 'Barra'
    order by res.time_slot, res.party_size desc
  loop
    select * into asg from fn_assign_table(v_bu, date '2026-08-01', r.time_slot, r.party_size, false);
    if asg.table_id is not null or asg.combo_id is not null then
      update reservations set table_id = asg.table_id, combo_id = asg.combo_id, zone_id = asg.zone_id
      where id = r.id;
    else
      sin_mesa := sin_mesa + 1;
      raise notice 'SIN MESA: reserva % (% pax a las %) — resolver a mano (curva de ocupación)', r.id, r.party_size, r.time_slot;
    end if;
  end loop;
  raise notice 'B5 listo. Reservas sin mesa asignada: %', sin_mesa;
end $$;

-- B6. Resumen del sábado (pax, pico, propuestas y depósitos pendientes)
with oc as (select id from business_units where code = 'OC'),
res as (
  select r.time_slot, r.party_size, coalesce(r.duration_min, 120) as dur,
         r.proposed_time, r.notes, coalesce(r.zone, '') as zone
  from reservations r, oc
  where r.bu_id = oc.id and r.date = '2026-08-01' and r.status in ('requested','confirmed','seated')
),
slots as (select generate_series(12*60, 22*60, 30) as m),
carga as (
  select s.m,
         coalesce(sum(res.party_size) filter (where
           split_part(res.time_slot,':',1)::int*60 + split_part(res.time_slot,':',2)::int <= s.m
           and split_part(res.time_slot,':',1)::int*60 + split_part(res.time_slot,':',2)::int + res.dur > s.m), 0) as pax,
         coalesce(sum(ceil(res.party_size / 4.0)) filter (where res.zone <> 'Barra'
           and split_part(res.time_slot,':',1)::int*60 + split_part(res.time_slot,':',2)::int <= s.m
           and split_part(res.time_slot,':',1)::int*60 + split_part(res.time_slot,':',2)::int + res.dur > s.m), 0) as mesas_req
  from slots s left join res on true
  group by s.m
)
select
  (select sum(party_size) from res)                                          as pax_total_dia,
  (select count(*) from res)                                                 as reservas,
  to_char(make_time(((c.m/60)%24)::int, (c.m%60)::int, 0), 'HH24:MI')        as pico_slot,
  c.pax                                                                      as pico_pax_simultaneos,
  c.mesas_req                                                                as pico_mesas_requeridas,
  (select count(*) from venue_tables t join venue_zones z on z.id = t.zone_id
    where t.bu_id = (select id from oc) and t.active and z.status = 'active' and z.kind = 'mesas') as mesas_disponibles,
  (select count(*) from res where proposed_time is not null)                 as propuestas_pendientes,
  (select count(*) from res where notes ilike '%Depósito requerido%')        as depositos_pendientes
from carga c
order by c.pax desc, c.m
limit 1;
