-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Plataforma de reservas multi-venue — FASE 3: Motor por mesa
-- Parámetros de reserva por venue (regla de oro: todo número es configurable) y
-- motor de disponibilidad como funciones de base de datos: el app, el link
-- público y el bot usan EXACTAMENTE el mismo cálculo.
-- El motor se activa por venue (engine='tables') cuando su piso está armado;
-- mientras esté en 'night' sigue el cupo por noche actual.
-- Requiere floor_phase1.sql y floor_phase2.sql. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Parámetros de reserva por venue ─────────────────────────────────────────
create table if not exists public.venue_reservation_settings (
  bu_id                uuid primary key references business_units(id) on delete cascade,
  engine               text not null default 'night' check (engine in ('night','tables')),
  slot_minutes         int  not null default 30 check (slot_minutes in (15,30,60)),
  -- duraciones por tamaño de grupo: primera entrada cuyo max_pax alcance
  durations            jsonb not null default '[{"max_pax":2,"minutes":90},{"max_pax":4,"minutes":120},{"max_pax":6,"minutes":150},{"max_pax":99,"minutes":180}]'::jsonb,
  buffer_minutes       int  not null default 15 check (buffer_minutes >= 0),
  pacing_max_pax       int  not null default 0  check (pacing_max_pax >= 0),   -- pax nuevos máx por slot (cocina); 0 = sin límite
  online_pct           int  not null default 100 check (online_pct between 0 and 100), -- % de la capacidad reservable en línea
  online_max_pax       int  not null default 8  check (online_max_pax >= 1),   -- grupo máx en línea; mayor → lo atiende el equipo
  no_show_hold_minutes int  not null default 15,                               -- tolerancia antes de liberar la mesa (Fase 4)
  updated_at           timestamptz not null default now()
);

drop trigger if exists trg_vressettings_touch on venue_reservation_settings;
create trigger trg_vressettings_touch before update on venue_reservation_settings
  for each row execute function touch_updated_at();

alter table venue_reservation_settings enable row level security;
drop policy if exists vressettings_select on venue_reservation_settings;
create policy vressettings_select on venue_reservation_settings for select to authenticated using (true);
drop policy if exists vressettings_write on venue_reservation_settings;
create policy vressettings_write on venue_reservation_settings for all to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id));

-- ─── Reservas: combinación asignada (además de zone_id/table_id de Fase 1) ───
alter table reservations add column if not exists combo_id uuid references table_combinations(id) on delete set null;

-- ─── Helper: 'HH:MM' → minutos normalizados (madrugada = +1440) ──────────────
create or replace function public.fn_slot_min(p_time text, p_open int)
returns int language sql immutable as $$
  select case when v < p_open then v + 1440 else v end
  from (select split_part(p_time, ':', 1)::int * 60 + split_part(p_time, ':', 2)::int as v) x;
$$;

-- ─── Motor: horarios disponibles para una fecha y tamaño de grupo ────────────
-- Devuelve cada slot con cuántas opciones libres hay (mesas + combinaciones).
-- p_online=true aplica además: zona reservable en línea, grupo máx online,
-- % de capacidad reservable en línea.
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

  -- Tope de pax reservable en línea por noche (% de la capacidad del piso)
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
    -- Pacing de cocina: pax que ya llegan en esta ventana de slot
    if s.pacing_max_pax > 0 then
      select coalesce(sum(r.party_size), 0) into v_slot_pax
        from reservations r
        where r.bu_id = p_bu and r.date = p_date
          and r.status in ('requested','confirmed','seated')
          and fn_slot_min(r.time_slot, v_open) >= m
          and fn_slot_min(r.time_slot, v_open) < m + s.slot_minutes;
      if v_slot_pax + p_pax > s.pacing_max_pax then continue; end if;
    end if;

    -- Mesas y combinaciones libres en [m, m + duración + buffer)
    select count(*) into v_free from (
      with busy as (
        select bt.tid from (
          select unnest(coalesce(tc.table_ids, array[r.table_id])) as tid,
                 fn_slot_min(r.time_slot, v_open) as rstart,
                 coalesce((select min((d->>'minutes')::int) from jsonb_array_elements(s.durations) d
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

-- ─── Motor: asignar la mejor mesa (o combinación) para un horario ────────────
-- Mejor = zona de mayor prioridad, luego la capacidad que mejor le queda.
-- Mesa sola gana sobre combinación. Sin filas = no hay lugar en ese horario.
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
        and fn_slot_min(r.time_slot, v_open) >= m - (m % s.slot_minutes) + 0
        and fn_slot_min(r.time_slot, v_open) < m - (m % s.slot_minutes) + s.slot_minutes;
    if v_slot_pax + p_pax > s.pacing_max_pax then return; end if;
  end if;

  return query
  with busy as (
    select bt.tid from (
      select unnest(coalesce(tc.table_ids, array[r.table_id])) as tid,
             fn_slot_min(r.time_slot, v_open) as rstart,
             coalesce((select min((d->>'minutes')::int) from jsonb_array_elements(s.durations) d
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

-- Cualquiera puede CONSULTAR disponibilidad (no expone datos personales);
-- escribir reservas sigue pasando por RLS / Edge Functions.
grant execute on function public.fn_slot_min(text, int) to anon, authenticated;
grant execute on function public.fn_available_slots(uuid, date, int, boolean) to anon, authenticated;
grant execute on function public.fn_assign_table(uuid, date, text, int, boolean) to anon, authenticated;
