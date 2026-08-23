-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · POR QUÉ NO HAY HORARIOS
--
-- "No hay horarios disponibles esa fecha" es la MISMA respuesta para siete
-- causas distintas: desde "el venue está lleno" —que es información real— hasta
-- "nadie configuró el horario del sábado", que es un hueco de configuración
-- disfrazado de venue lleno. Con ese mensaje es imposible saber cuál es.
--
-- Esta función revisa los siete filtros del motor EN ORDEN y dice cuál corta.
-- Se usa desde el SQL Editor o desde la app; no la ve el cliente.
--
--   select * from fn_slots_diagnostico('OC', '2026-08-22', 2);
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_slots_diagnostico(
  p_code text, p_date date, p_pax int default 2, p_online boolean default true
) returns table (paso text, ok boolean, detalle text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_bu uuid; v_name text;
  s venue_reservation_settings%rowtype;
  v_cap record;
  v_mesas int; v_mesas_online int; v_mesas_pax int; v_combos_pax int;
  v_total_cap int; v_online_used int; v_limite int;
  v_slots int;
begin
  select id, name into v_bu, v_name from business_units where upper(code) = upper(p_code);
  if v_bu is null then
    return query select '0. Venue'::text, false, format('No existe un venue con código %s', p_code); return;
  end if;
  return query select '0. Venue'::text, true, format('%s (%s) · %s · %s pax',
    v_name, upper(p_code), to_char(p_date, 'TMDay DD "de" TMMonth'), p_pax);

  -- 1 ── Motor por mesas encendido
  select * into s from venue_reservation_settings where bu_id = v_bu;
  if not found then
    return query select '1. Motor'::text, false,
      'Este venue NO tiene fila en venue_reservation_settings: el motor por mesas nunca devuelve horarios. Config del venue → Motor por mesas.'; return;
  end if;
  if s.engine is distinct from 'tables' then
    return query select '1. Motor'::text, false,
      format('engine = "%s" (no es "tables"). Con hora libre el formulario no pide horario del motor.', coalesce(s.engine,'—')); return;
  end if;
  return query select '1. Motor'::text, true,
    format('tables · slots de %s min · buffer %s min · pacing %s', s.slot_minutes, s.buffer_minutes,
           case when s.pacing_max_pax > 0 then s.pacing_max_pax || ' pax por slot' else 'sin límite' end);

  -- 2 ── Tope de personas por canal en línea
  if p_online and p_pax > s.online_max_pax then
    return query select '2. Tope en línea'::text, false,
      format('Pides %s pax pero online_max_pax = %s: los grupos más grandes se mandan al equipo a propósito.', p_pax, s.online_max_pax); return;
  end if;
  return query select '2. Tope en línea'::text, true,
    format('%s pax cabe en el máximo de %s por web', p_pax, s.online_max_pax);

  -- 3 ── Horario del DÍA DE LA SEMANA (la causa silenciosa más común)
  select vc.open_time, vc.close_time, vc.active into v_cap
    from venue_capacity vc
   where vc.bu_id = v_bu and vc.day_of_week = extract(dow from p_date)::int;
  if not found then
    return query select '3. Horario del día'::text, false,
      format('NO hay fila de capacidad para %s (día %s). Capacidad → agrega ese día.',
             to_char(p_date,'TMDay'), extract(dow from p_date)::int); return;
  end if;
  if not v_cap.active then
    return query select '3. Horario del día'::text, false,
      format('El %s está marcado como INACTIVO en Capacidad — el venue cierra ese día.', to_char(p_date,'TMDay')); return;
  end if;
  if v_cap.open_time is null or v_cap.close_time is null then
    return query select '3. Horario del día'::text, false,
      format('El %s está activo pero SIN hora de apertura o cierre (open=%s, close=%s). El motor no puede generar slots sin horario: Capacidad → pon las horas.',
             to_char(p_date,'TMDay'), coalesce(v_cap.open_time,'vacío'), coalesce(v_cap.close_time,'vacío')); return;
  end if;
  return query select '3. Horario del día'::text, true,
    format('%s de %s a %s', to_char(p_date,'TMDay'), v_cap.open_time, v_cap.close_time);

  -- 4 ── Cuota del canal en línea
  select coalesce(sum(t.max_pax),0) into v_total_cap
    from venue_tables t join venue_zones z on z.id = t.zone_id
   where t.bu_id = v_bu and t.active and z.status = 'active';
  select coalesce(sum(r.party_size),0) into v_online_used
    from reservations r
   where r.bu_id = v_bu and r.date = p_date
     and r.status in ('requested','confirmed','seated')
     and r.source in ('web','whatsapp','instagram');
  v_limite := floor(v_total_cap * s.online_pct / 100.0);
  if p_online and s.online_pct < 100 and v_online_used + p_pax > v_limite then
    return query select '4. Cuota en línea'::text, false,
      format('El canal en línea ya ocupó %s de %s pax permitidos (%s%% del aforo de %s). Sube online_pct o libera cupo.',
             v_online_used, v_limite, s.online_pct, v_total_cap); return;
  end if;
  return query select '4. Cuota en línea'::text, true,
    format('%s de %s pax usados por web/bot (%s%% de %s de aforo)', v_online_used, v_limite, s.online_pct, v_total_cap);

  -- 5 ── ¿Hay piso configurado?
  select count(*) into v_mesas from venue_tables t where t.bu_id = v_bu and t.active;
  if v_mesas = 0 then
    return query select '5. Piso'::text, false,
      'No hay NINGUNA mesa activa en el Editor de piso. Con el motor por mesas encendido y sin mesas, jamás habrá horarios.'; return;
  end if;
  select count(*) into v_mesas_online
    from venue_tables t join venue_zones z on z.id = t.zone_id
   where t.bu_id = v_bu and t.active and z.status = 'active' and z.reservable_online;
  if p_online and v_mesas_online = 0 then
    return query select '5. Piso'::text, false,
      format('Hay %s mesas activas pero NINGUNA en zona reservable en línea. Editor de piso → marca la zona como reservable online.', v_mesas); return;
  end if;
  return query select '5. Piso'::text, true,
    format('%s mesas activas · %s reservables en línea', v_mesas, v_mesas_online);

  -- 6 ── ¿Alguna mesa ADMITE ese tamaño de grupo? (min_pax es el filtro que
  --      más sorprende: una mesa de mínimo 4 nunca aparece para una pareja)
  select count(*) into v_mesas_pax
    from venue_tables t join venue_zones z on z.id = t.zone_id
   where t.bu_id = v_bu and t.active and z.status = 'active'
     and (not p_online or z.reservable_online)
     and t.min_pax <= p_pax and t.max_pax >= p_pax;
  select count(*) into v_combos_pax
    from table_combinations tc join venue_zones z on z.id = tc.zone_id
   where tc.bu_id = v_bu and z.status = 'active'
     and (not p_online or z.reservable_online)
     and tc.min_pax <= p_pax and tc.max_pax >= p_pax;
  if v_mesas_pax + v_combos_pax = 0 then
    return query select '6. Tamaño de grupo'::text, false,
      format('NINGUNA mesa ni combinación acepta %s personas (se revisa min_pax <= %s <= max_pax). Suele ser el min_pax: una mesa con mínimo de 4 nunca sale para una pareja. Editor de piso → baja el mínimo.', p_pax, p_pax); return;
  end if;
  return query select '6. Tamaño de grupo'::text, true,
    format('%s mesas y %s combinaciones aceptan %s pax', v_mesas_pax, v_combos_pax, p_pax);

  -- 7 ── Con todo lo anterior en orden: ¿el motor devuelve algo?
  select count(*) into v_slots from fn_available_slots(v_bu, p_date, p_pax, p_online);
  if v_slots = 0 then
    return query select '7. Disponibilidad'::text, false,
      'La configuración está COMPLETA y aun así no hay horarios: ese día está genuinamente lleno para ese tamaño de grupo (mesas ocupadas, buffer o pacing). Esto sí es información real, no un hueco de configuración.';
  else
    return query select '7. Disponibilidad'::text, true,
      format('%s horarios disponibles — si el formulario público no los muestra, el problema NO es la base: revisa el despliegue.', v_slots);
  end if;
end $$;

revoke all on function public.fn_slots_diagnostico(text, date, int, boolean) from public;
grant execute on function public.fn_slots_diagnostico(text, date, int, boolean) to authenticated;
