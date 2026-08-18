-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · ATRIBUCIÓN PR — FASE 1 (el dinero)
--
-- La Fase 0 puso la identidad: quién es cada PR y qué reserva trajo. Esta fase
-- pone lo que sigue: cuánto se le debe, quién lo autoriza y cuándo se paga.
--
-- Recordatorio del principio: el dinero solo se libera con eventos que el PR NO
-- controla. Aquí eso se vuelve literal —
--   · el HOST captura cuánta gente llegó de verdad (pax_sentado)
--   · el TICKET pone el consumo
--   · el GERENTE valida
--   · el corte quincenal lo firma quien administra la red
-- El PR solo mira. No hay una sola función aquí que él pueda ejecutar.
--
--   fn_pr_calcular_comision()  el cálculo, con snapshot de la política del día
--   fn_pr_cerrar_consumo()     host/gerente captura consumo → dispara cálculo
--   fn_pr_validar_comision()   el gerente aprueba o rechaza
--   fn_pr_corte()              agrupa la quincena y la libera
--   fn_pr_mis_numeros()        lo que el PR ve de sí mismo (y nada más)
--   fn_pr_alternativas()       cuando el cupo se llenó: a dónde sí
--
-- Requiere pr_attribution.sql. Ejecutar en el SQL Editor de Supabase.
-- Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Periodo de corte: quincenas naturales ──────────────────────────────────
-- '2026-08-Q1' = del 1 al 15 · '2026-08-Q2' = del 16 al fin de mes
create or replace function public.fn_pr_periodo(p_fecha date default current_date)
returns text language sql immutable as $$
  select to_char(p_fecha, 'YYYY-MM') || (case when extract(day from p_fecha) <= 15 then '-Q1' else '-Q2' end)
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- CÁLCULO DE COMISIÓN
-- Se dispara cuando hay consumo capturado. Guarda SNAPSHOT completo: tier,
-- tarifa y cada multiplicador aplicado. Cambiar la política mañana no toca
-- este registro — es la diferencia entre un sistema auditable y una hoja de
-- cálculo que nadie puede reconstruir seis meses después.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.fn_pr_calcular_comision(p_reservation uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_res    reservations%rowtype;
  v_attr   pr_attributions%rowtype;
  v_pr     pr_profiles%rowtype;
  v_cfg    pr_venue_config%rowtype;
  v_tarifa numeric(5,4);
  v_mults  jsonb := '[]'::jsonb;
  v_reduc  jsonb := '[]'::jsonb;
  v_factor_mult numeric := 1;
  v_pax    int;
  v_monto  numeric(12,2);
  v_tope   boolean := false;
  v_estado text;
  v_id     uuid;
begin
  select * into v_res from reservations where id = p_reservation;
  if not found then return jsonb_build_object('ok', false, 'error', 'Reserva no encontrada.'); end if;

  select * into v_attr from pr_attributions where reservation_id = p_reservation and estado = 'activa';
  if not found then return jsonb_build_object('ok', false, 'error', 'La reserva no tiene atribución activa.'); end if;

  select * into v_pr  from pr_profiles      where id = v_attr.pr_id;
  select * into v_cfg from pr_venue_config  where bu_id = v_res.bu_id;
  if v_cfg.bu_id is null or not v_cfg.activo then
    return jsonb_build_object('ok', false, 'error', 'Este venue no participa del programa PR.');
  end if;

  -- Una comisión ya validada o pagada NO se recalcula: si el gerente ajusta
  -- el consumo después, eso entra como partida del siguiente corte.
  select estado into v_estado from pr_commissions where attribution_id = v_attr.id;
  if v_estado in ('validada','liberada','en_pago','pagada') then
    return jsonb_build_object('ok', false, 'error', format('La comisión ya está %s — un ajuste entra en el siguiente corte.', v_estado));
  end if;

  -- pax REAL (el que capturó el host), no el que se reservó
  v_pax := coalesce(v_res.pax_sentado, v_res.party_size);

  v_tarifa := case v_pr.tier
    when 'embajador' then v_cfg.tarifa_embajador
    when 'oro'       then v_cfg.tarifa_oro
    when 'plata'     then v_cfg.tarifa_plata
    else                  v_cfg.tarifa_aspirante end;

  -- ── Multiplicadores (contra la config del venue, nunca hardcodeados) ──
  if extract(dow from v_res.date)::int = any (v_cfg.dias_valle) then
    v_factor_mult := v_factor_mult * v_cfg.mult_dia_valle;
    v_mults := v_mults || jsonb_build_object('tipo','dia_valle','factor',v_cfg.mult_dia_valle);
  end if;
  if v_attr.cliente_es_nuevo then
    v_factor_mult := v_factor_mult * v_cfg.mult_cliente_nuevo;
    v_mults := v_mults || jsonb_build_object('tipo','cliente_nuevo','factor',v_cfg.mult_cliente_nuevo);
  end if;
  if v_pax >= v_cfg.mesa_grande_desde then
    v_factor_mult := v_factor_mult * v_cfg.mult_mesa_grande;
    v_mults := v_mults || jsonb_build_object('tipo','mesa_grande','factor',v_cfg.mult_mesa_grande,'pax',v_pax);
  end if;
  -- Tope combinado: sin esto, tres multiplicadores encimados vuelven la
  -- comisión más cara que el margen de la mesa.
  if v_factor_mult > v_cfg.mult_tope then
    v_mults := v_mults || jsonb_build_object('tipo','tope_multiplicadores','de',round(v_factor_mult,3),'a',v_cfg.mult_tope);
    v_factor_mult := v_cfg.mult_tope;
  end if;

  -- ── Monto ────────────────────────────────────────────────────────────────
  if v_cfg.modo_cuota_fija then
    -- Casas sin POS integrado: cuota por cover sentado, sin porcentaje. Es
    -- menos justo pero es auditable, que es lo que importa mientras llega el POS.
    v_monto := v_cfg.cuota_por_cover * v_pax * v_attr.factor_atribucion * v_factor_mult;
    v_mults := v_mults || jsonb_build_object('tipo','cuota_fija','por_cover',v_cfg.cuota_por_cover);
  else
    if v_res.consumo_neto is null then
      return jsonb_build_object('ok', false, 'error', 'Falta capturar el consumo de la mesa.');
    end if;
    -- PISO por persona: una mesa de 6 que consumió $400 no genera comisión.
    -- Es la defensa contra llenar el lugar con gente que no consume.
    if v_pax > 0 and v_cfg.piso_por_persona > 0
       and (v_res.consumo_neto / v_pax) < v_cfg.piso_por_persona then
      v_monto := 0;
      v_reduc := v_reduc || jsonb_build_object('tipo','bajo_piso',
                   'consumo_por_persona', round(v_res.consumo_neto / v_pax, 2),
                   'piso', v_cfg.piso_por_persona);
    else
      v_monto := v_res.consumo_neto * v_attr.factor_atribucion * v_tarifa * v_factor_mult;
    end if;
  end if;

  -- TECHO por reserva: arriba de esto se paga el techo y se levanta la mano
  if v_monto > v_cfg.techo_por_reserva then
    v_reduc := v_reduc || jsonb_build_object('tipo','techo','calculado',round(v_monto,2),'techo',v_cfg.techo_por_reserva);
    v_monto := v_cfg.techo_por_reserva;
    v_tope  := true;
  end if;
  v_monto := round(greatest(v_monto, 0), 2);

  insert into pr_commissions (
    attribution_id, reservation_id, pr_id, bu_id,
    base_consumo_neto, pax_sentado, tier_aplicado, tarifa_base, factor_atribucion,
    multiplicadores, reducciones, tope_aplicado, monto, periodo_corte, estado)
  values (
    v_attr.id, p_reservation, v_pr.id, v_res.bu_id,
    coalesce(v_res.consumo_neto, 0), v_pax, v_pr.tier, v_tarifa, v_attr.factor_atribucion,
    v_mults, v_reduc, v_tope, v_monto, fn_pr_periodo(v_res.date), 'calculada')
  on conflict (attribution_id) do update set
    base_consumo_neto = excluded.base_consumo_neto, pax_sentado = excluded.pax_sentado,
    tier_aplicado = excluded.tier_aplicado, tarifa_base = excluded.tarifa_base,
    factor_atribucion = excluded.factor_atribucion, multiplicadores = excluded.multiplicadores,
    reducciones = excluded.reducciones, tope_aplicado = excluded.tope_aplicado,
    monto = excluded.monto, periodo_corte = excluded.periodo_corte, estado = 'calculada'
  returning id into v_id;

  return jsonb_build_object('ok', true, 'commission_id', v_id, 'monto', v_monto,
                            'tier', v_pr.tier, 'tarifa', v_tarifa,
                            'multiplicadores', v_mults, 'reducciones', v_reduc,
                            'periodo', fn_pr_periodo(v_res.date));
end $$;

-- ─── Capturar consumo (host o gerente) y disparar el cálculo ────────────────
create or replace function public.fn_pr_cerrar_consumo(
  p_reservation uuid, p_consumo numeric, p_pax_sentado int default null, p_ticket_url text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_bu uuid; v_com jsonb;
begin
  select bu_id into v_bu from reservations where id = p_reservation;
  if v_bu is null then return jsonb_build_object('ok', false, 'error', 'Reserva no encontrada.'); end if;
  -- El PR NO puede capturar consumo. Es la regla que sostiene todo el módulo.
  -- coalesce en TODO guardia: con rol NULL, `x in (...)` da NULL y `if not
  -- NULL` no bloquea — el permiso se caería solo. Ante la duda, no pasa.
  if coalesce(hog_role() = 'PR', false) or fn_my_pr_id() is not null then
    return jsonb_build_object('ok', false, 'error', 'Un PR no puede capturar el consumo de una mesa.');
  end if;
  if not coalesce(hog_role() in ('MASTER','C_LEVEL') or hog_has_venue(v_bu), false) then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso sobre este venue.');
  end if;
  if p_consumo < 0 then return jsonb_build_object('ok', false, 'error', 'El consumo no puede ser negativo.'); end if;

  update reservations set
    consumo_neto = p_consumo,
    pax_sentado  = coalesce(p_pax_sentado, pax_sentado, party_size),
    ticket_url   = coalesce(p_ticket_url, ticket_url),
    consumo_at   = now(), consumo_por = auth.uid(),
    status       = case when status = 'seated' then 'completed' else status end
  where id = p_reservation;

  -- Si la reserva trae PR, la comisión nace aquí (estado 'calculada': el PR
  -- ya la ve en su portal, pero todavía no es dinero suyo).
  if exists (select 1 from pr_attributions where reservation_id = p_reservation and estado = 'activa') then
    v_com := fn_pr_calcular_comision(p_reservation);
  end if;
  return jsonb_build_object('ok', true, 'comision', v_com);
end $$;

-- ─── Validación del gerente (T+1) ───────────────────────────────────────────
create or replace function public.fn_pr_validar_comision(
  p_commission uuid, p_aprueba boolean, p_motivo text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_c pr_commissions%rowtype;
begin
  select * into v_c from pr_commissions where id = p_commission;
  if not found then return jsonb_build_object('ok', false, 'error', 'Comisión no encontrada.'); end if;
  if fn_my_pr_id() is not null then
    return jsonb_build_object('ok', false, 'error', 'Un PR no puede validar su propia comisión.');
  end if;
  if not coalesce(fn_pr_admin() or (hog_role() = 'OPS_MANAGER' and hog_has_venue(v_c.bu_id)), false) then
    return jsonb_build_object('ok', false, 'error', 'Solo el gerente de la casa (o dirección) valida.');
  end if;
  if v_c.estado not in ('calculada','retenida') then
    return jsonb_build_object('ok', false, 'error', format('Esta comisión ya está %s.', v_c.estado));
  end if;
  if not p_aprueba and coalesce(trim(p_motivo),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'Para rechazar hace falta el motivo.');
  end if;

  update pr_commissions set
    estado = case when p_aprueba then 'validada' else 'rechazada' end,
    motivo_rechazo = case when p_aprueba then null else trim(p_motivo) end,
    validaciones = validaciones || jsonb_build_object(
      'paso', case when p_aprueba then 'validada' else 'rechazada' end,
      'por', auth.uid(), 'at', now(), 'motivo', p_motivo)
  where id = p_commission;
  return jsonb_build_object('ok', true, 'estado', case when p_aprueba then 'validada' else 'rechazada' end);
end $$;

-- ─── Corte quincenal: libera lo validado ────────────────────────────────────
create or replace function public.fn_pr_corte(p_periodo text, p_liberar boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_n int; v_prs int;
begin
  if not fn_pr_admin() then
    return jsonb_build_object('ok', false, 'error', 'Solo dirección o el PR Manager cierran el corte.');
  end if;
  select coalesce(sum(monto),0), count(*), count(distinct pr_id)
    into v_total, v_n, v_prs
    from pr_commissions where periodo_corte = p_periodo and estado = 'validada';

  if p_liberar then
    if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'No hay comisiones validadas en este periodo.'); end if;
    update pr_commissions set
      estado = 'liberada',
      validaciones = validaciones || jsonb_build_object('paso','liberada','por',auth.uid(),'at',now())
    where periodo_corte = p_periodo and estado = 'validada';
  end if;

  return jsonb_build_object('ok', true, 'periodo', p_periodo, 'total', v_total,
                            'comisiones', v_n, 'prs', v_prs, 'liberado', p_liberar);
end $$;

-- ─── Lo que el PR ve de sí mismo (y solo de sí mismo) ───────────────────────
create or replace function public.fn_pr_mis_numeros(p_pr uuid default null, p_periodo text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_pr uuid; v_per text; v_r jsonb;
begin
  v_pr  := coalesce(p_pr, fn_my_pr_id());
  v_per := coalesce(p_periodo, fn_pr_periodo());
  if v_pr is null then return jsonb_build_object('ok', false, 'error', 'Sin perfil de PR.'); end if;
  -- Un PR solo se consulta a sí mismo; dirección consulta a cualquiera.
  if v_pr <> coalesce(fn_my_pr_id(), '00000000-0000-0000-0000-000000000000'::uuid)
     and not fn_pr_admin() then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso.');
  end if;

  select jsonb_build_object(
    'ok', true, 'periodo', v_per,
    'por_validar', coalesce(sum(monto) filter (where estado = 'calculada'), 0),
    'validado',    coalesce(sum(monto) filter (where estado = 'validada'), 0),
    'liberado',    coalesce(sum(monto) filter (where estado in ('liberada','en_pago')), 0),
    'pagado',      coalesce(sum(monto) filter (where estado = 'pagada'), 0),
    'reservas',    count(*)
  ) into v_r
  from pr_commissions where pr_id = v_pr and periodo_corte = v_per;

  -- Reservas vivas del periodo (aún sin consumo): lo que trae en camino
  return v_r || (
    select jsonb_build_object(
      'en_camino', count(*),
      'pax_en_camino', coalesce(sum(r.party_size), 0),
      'sentadas', count(*) filter (where r.status in ('seated','completed')),
      'no_show',  count(*) filter (where r.status = 'no_show'))
    from pr_attributions a join reservations r on r.id = a.reservation_id
    where a.pr_id = v_pr and a.estado = 'activa' and fn_pr_periodo(r.date) = v_per);
end $$;

-- ─── Cupo lleno: a dónde SÍ ─────────────────────────────────────────────────
-- El brief lo dice bien: el mensaje de "no hay lugar" no es un error, es la
-- feature — es lo que convierte al PR en canal de redistribución hacia días
-- valle y casas hermanas. Devuelve fechas cercanas y otras casas con cupo.
create or replace function public.fn_pr_alternativas(p_bu uuid, p_fecha date, p_pax int default 2)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_fechas jsonb; v_casas jsonb;
begin
  -- generate_series sobre fechas devuelve TIMESTAMPTZ, no DATE: sin el cast
  -- explícito, fn_pr_cupo(uuid, date) no resuelve y la función truena.
  select coalesce(jsonb_agg(jsonb_build_object('fecha', d, 'disponible', (fn_pr_cupo(p_bu, d)->>'disponible')::int)
                            order by d), '[]'::jsonb)
    into v_fechas
    from (select gs::date as d from generate_series(p_fecha - 2, p_fecha + 2, '1 day') gs) f
   where d >= current_date and d <> p_fecha
     and (fn_pr_cupo(p_bu, d)->>'disponible')::int >= p_pax;

  select coalesce(jsonb_agg(jsonb_build_object('bu_id', b.id, 'code', b.code, 'name', b.name,
                                               'disponible', (fn_pr_cupo(b.id, p_fecha)->>'disponible')::int)
                            order by b.name), '[]'::jsonb)
    into v_casas
    from business_units b
    join pr_venue_config c on c.bu_id = b.id and c.activo
   where b.id <> p_bu and (fn_pr_cupo(b.id, p_fecha)->>'disponible')::int >= p_pax;

  return jsonb_build_object('otras_fechas', v_fechas, 'otras_casas', v_casas);
end $$;

revoke all on function public.fn_pr_calcular_comision(uuid) from public;
revoke all on function public.fn_pr_cerrar_consumo(uuid, numeric, int, text) from public;
revoke all on function public.fn_pr_validar_comision(uuid, boolean, text) from public;
revoke all on function public.fn_pr_corte(text, boolean) from public;
grant execute on function public.fn_pr_calcular_comision(uuid) to authenticated;
grant execute on function public.fn_pr_cerrar_consumo(uuid, numeric, int, text) to authenticated;
grant execute on function public.fn_pr_validar_comision(uuid, boolean, text) to authenticated;
grant execute on function public.fn_pr_corte(text, boolean) to authenticated;
grant execute on function public.fn_pr_mis_numeros(uuid, text) to authenticated;
grant execute on function public.fn_pr_alternativas(uuid, date, int) to authenticated, anon;
grant execute on function public.fn_pr_periodo(date) to authenticated, anon;

-- ═════════════════════════════════════════════════════════════════════════════
-- TIER AUTOMÁTICO — ventana rodante de 90 días
-- Se corre a mano o por cron el día 1. Sube y baja: un tier que solo sube deja
-- de significar algo. Nunca toca comisiones ya devengadas (llevan su snapshot).
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.fn_pr_recalcular_tiers(p_aplicar boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_cambios jsonb := '[]'::jsonb; r record; v_nuevo text;
begin
  if not fn_pr_admin() then
    return jsonb_build_object('ok', false, 'error', 'Solo dirección o el PR Manager recalculan tiers.');
  end if;
  for r in
    select p.id, p.codigo, p.full_name, p.tier,
           count(*) filter (where res.status in ('seated','completed')) as sentadas,
           coalesce(sum(coalesce(res.pax_sentado, res.party_size))
                    filter (where res.status in ('seated','completed')), 0) as covers,
           count(*) filter (where res.status = 'no_show') as noshows,
           count(*) as total
      from pr_profiles p
      left join pr_attributions a on a.pr_id = p.id and a.estado = 'activa'
      left join reservations res on res.id = a.reservation_id and res.date >= current_date - 90
     where p.estatus = 'activo'
     group by p.id, p.codigo, p.full_name, p.tier
  loop
    -- Show rate manda: traer mucha gente que no llega no es traer gente.
    v_nuevo := case
      when r.total >= 8 and r.sentadas::numeric / greatest(r.total,1) < 0.65 then 'aspirante'
      when r.covers >= 150 then 'embajador'
      when r.covers >=  70 then 'oro'
      when r.covers >=  25 then 'plata'
      else 'aspirante' end;
    if v_nuevo <> r.tier then
      v_cambios := v_cambios || jsonb_build_object(
        'pr', r.full_name, 'codigo', r.codigo, 'de', r.tier, 'a', v_nuevo,
        'covers', r.covers, 'sentadas', r.sentadas, 'total', r.total);
      if p_aplicar then
        update pr_profiles set tier = v_nuevo, tier_desde = current_date where id = r.id;
      end if;
    end if;
    -- Show rate bajo → bloqueo de fin de semana 30 días (castigo operativo,
    -- no monetario: el brief es explícito en que no se le quita dinero)
    if p_aplicar and r.total >= 8 and r.sentadas::numeric / greatest(r.total,1) < 0.65 then
      update pr_profiles
         set restricciones = restricciones || jsonb_build_object('bloqueo_finde_hasta', (current_date + 30)::text)
       where id = r.id;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'aplicado', p_aplicar, 'cambios', v_cambios);
end $$;
grant execute on function public.fn_pr_recalcular_tiers(boolean) to authenticated;
