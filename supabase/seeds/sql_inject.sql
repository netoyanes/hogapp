-- ─────────────────────────────────────────────────────────────────────────────
-- INYECCIÓN DE SQL (solo Master) — el botón ⚡SQL de la app.
-- Un agente de IA propone un bloque de INSERTs (ver docs/PROMPT_INYECTAR_SQL.md);
-- el Master lo pega, lo PREVISUALIZA (se ejecuta de verdad y se revierte, así
-- el preview es exacto y no una adivinanza) y, si lo firma, lo aplica.
--
-- Seguridad, en capas:
--   1. Solo hog_role() = 'MASTER' puede ejecutarla.
--   2. Se rechaza cualquier verbo que no sea INSERT (DDL, UPDATE, DELETE…),
--      revisando el texto SIN literales de cadena para no dar falsos positivos
--      con títulos como 'Update de la carta'.
--   3. El preview corre en una subtransacción que SIEMPRE se revierte.
--   4. Todo queda registrado en activity_log.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_sql_inject(p_sql text, p_apply boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sql        text;
  v_check      text;
  v_ep_before  uuid[];
  v_tk_before  uuid[];
  v_rs_before  uuid[];
  v_bi_before  uuid[];
  v_created    jsonb;
  v_detail     text;
begin
  if hog_role() <> 'MASTER' then
    raise exception 'Solo el Master puede inyectar SQL.';
  end if;
  if coalesce(btrim(p_sql), '') = '' then
    raise exception 'No mandaste ningún SQL.';
  end if;

  -- El control de transacción lo lleva la función, no el texto pegado
  v_sql := btrim(p_sql);
  v_sql := regexp_replace(v_sql, '^\s*begin\s*;', '', 'i');
  v_sql := regexp_replace(v_sql, 'commit\s*;\s*$', '', 'i');
  v_sql := btrim(v_sql);

  -- Texto para revisar: sin comentarios y sin literales de cadena
  v_check := regexp_replace(v_sql, '--[^\n]*', ' ', 'g');
  v_check := regexp_replace(v_check, '/\*.*?\*/', ' ', 'gs');
  v_check := regexp_replace(v_check, '''([^'']|'''')*''', ' ''''  ', 'g');
  v_check := lower(v_check);

  if v_check !~ '\minsert\M' then
    raise exception 'El SQL no contiene ningún INSERT — no hay nada que crear.';
  end if;
  if v_check ~ '\m(drop|truncate|alter|grant|revoke|vacuum|reindex|copy|call|do)\M' then
    raise exception 'Bloqueado: el SQL contiene una operación de esquema o administración. Aquí solo se aceptan INSERT.';
  end if;
  if v_check ~ '\mdelete\s+from\M' then
    raise exception 'Bloqueado: el SQL contiene DELETE. Nada se borra desde aquí — en la app se archiva.';
  end if;
  if v_check ~ '\mupdate\s+\w' then
    raise exception 'Bloqueado: el SQL contiene UPDATE. Aquí solo se crean cosas nuevas.';
  end if;
  if v_check ~ '\mcreate\s+(table|function|policy|role|user|extension|trigger|view|index)\M' then
    raise exception 'Bloqueado: el SQL intenta crear objetos de base de datos.';
  end if;
  -- Tablas sensibles: los permisos y el dinero no se tocan por esta vía
  if v_check ~ '\minto\s+(public\.)?(profiles|user_apps|app_settings|finance_\w+|invitations|user_capabilities)\M' then
    raise exception 'Bloqueado: esa tabla no se puede alimentar por inyección (permisos, ajustes o finanzas).';
  end if;

  -- Foto de "antes" para saber exactamente qué nació con este SQL
  select coalesce(array_agg(id), '{}') into v_ep_before from event_plans;
  select coalesce(array_agg(id), '{}') into v_tk_before from tasks;
  select coalesce(array_agg(id), '{}') into v_rs_before from project_resources;
  select coalesce(array_agg(id), '{}') into v_bi_before from project_budget_items;

  begin
    execute v_sql;

    v_created := jsonb_build_object(
      'proyectos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'nombre', e.name, 'tipo', e.kind, 'estado', e.status,
          'inicio', e.date, 'fin', e.end_date, 'presupuesto', e.budget,
          'venue', (select b.code from business_units b where b.id = e.bu_id),
          'responsable', (select coalesce(p.full_name, p.email) from profiles p where p.id = e.responsible)
        ) order by e.name)
        from event_plans e where not (e.id = any(v_ep_before))
      ), '[]'::jsonb),
      'tareas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'titulo', t.title, 'area', t.area, 'prioridad', t.priority,
          'vence', t.due_date, 'horas', t.estimated_hours,
          'venue', (select b.code from business_units b where b.id = t.bu_id),
          'asignada_a', (select coalesce(p.full_name, p.email) from profiles p where p.id = t.assigned_to),
          'proyecto', (select e2.name from event_plans e2 where e2.id = t.event_id)
        ) order by t.due_date nulls last, t.title)
        from tasks t where not (t.id = any(v_tk_before))
      ), '[]'::jsonb),
      'recursos', coalesce((
        select jsonb_agg(jsonb_build_object('nombre', r.name, 'cantidad', r.qty, 'costo_unitario', r.unit_cost))
        from project_resources r where not (r.id = any(v_rs_before))
      ), '[]'::jsonb),
      'presupuesto', coalesce((
        select jsonb_agg(jsonb_build_object('concepto', b.concept, 'monto', b.amount, 'es_ingreso', b.is_income))
        from project_budget_items b where not (b.id = any(v_bi_before))
      ), '[]'::jsonb)
    );

    -- Preview: se revierte la subtransacción llevándose el resultado en DETAIL
    if not p_apply then
      raise exception 'HOG_DRYRUN' using detail = v_created::text;
    end if;

  exception
    when others then
      if sqlerrm = 'HOG_DRYRUN' then
        get stacked diagnostics v_detail = pg_exception_detail;
        return jsonb_build_object('ok', true, 'aplicado', false, 'creado', v_detail::jsonb);
      end if;
      raise;
  end;

  insert into activity_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'sql_injected', 'system', null,
          jsonb_build_object('creado', v_created, 'sql', left(v_sql, 4000)));

  return jsonb_build_object('ok', true, 'aplicado', true, 'creado', v_created);
end
$$;

revoke all on function public.fn_sql_inject(text, boolean) from public;
grant execute on function public.fn_sql_inject(text, boolean) to authenticated;

notify pgrst, 'reload schema';
