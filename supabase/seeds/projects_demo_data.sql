-- ═════════════════════════════════════════════════════════════════════════════
-- PROYECTOS · Datos DEMO — un plan de cada tipo, como si ya se usara:
-- evento comunidad (POD), evento música (Bruma), adecuación (OC),
-- remodelación (Casa Ajeno), apertura (POD MZT) y mantenimiento (Apricot).
-- Con recursos, partidas (incl. patrocinio), tareas con avance y 1 plantilla.
-- Idempotente (si ya se sembró, no duplica). Limpieza al final, comentada.
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_pc uuid; v_bm uuid; v_oc uuid; v_ca uuid; v_pm uuid; v_am uuid; v_resp uuid;
  e uuid;
begin
  if exists (select 1 from event_plans where name = 'Noche Nacional — Comunidad POD') then
    raise notice 'Demo de Proyectos ya sembrada — sin cambios.';
    return;
  end if;
  select id into v_pc from business_units where code = 'PC';
  select id into v_bm from business_units where code = 'BM';
  select id into v_oc from business_units where code = 'OC';
  select id into v_ca from business_units where code = 'CA';
  select id into v_pm from business_units where code = 'PM';
  select id into v_am from business_units where code = 'AM';
  select id into v_resp from profiles where role = 'MASTER' limit 1;

  -- ── 1) EVENTO · comunidad — el ejemplo del event planner de POD ────────────
  insert into event_plans (bu_id, name, description, kind, event_type, date, start_time, end_time,
    has_cover, expected_attendance, requirements, collaborators, responsible, status)
  values (v_pc, 'Noche Nacional — Comunidad POD',
    'Encuentro mensual de la comunidad nacional: música, cocina de temporada y marcas invitadas.',
    'evento', 'comunidad', '2026-08-07', '19:00', '23:00', false, 120,
    'dj setup, iluminación cálida, 2 mesas de exhibición', 'DJ Selva Norte, Cerveza Nacional', v_resp, 'approved')
  returning id into e;
  insert into project_resources (event_id, name, qty, unit_cost) values
    (e, 'Bartender', 1, 1200), (e, 'Mesero', 2, 800),
    (e, 'Guardia de seguridad', 1, 900), (e, 'DJ local', 1, 3500);
  insert into project_budget_items (event_id, concept, amount, is_income) values
    (e, 'Sombreros artesanales', 3500, false), (e, 'Vasos especiales edición POD', 2800, false),
    (e, 'Decoración y flores', 1900, false), (e, 'Patrocinio Cerveza Nacional', 20000, true);
  insert into tasks (title, status, priority, deadline_type, bu_id, due_date, event_id, area, client_impact) values
    ('Confirmar DJ y rider técnico', 'DONE', 'HIGH', 'HARD', v_pc, '2026-08-05', e, 'talento', 'client_facing'),
    ('Diseñar flyer y publicarlo', 'DONE', 'MEDIUM', 'SOFT', v_pc, '2026-08-03', e, 'marketing', 'client_facing'),
    ('Brief a cocina — menú de la noche', 'OPEN', 'MEDIUM', 'SOFT', v_pc, '2026-08-06', e, 'piso', 'client_facing'),
    ('Comprar sombreros y vasos', 'OPEN', 'MEDIUM', 'SOFT', v_pc, '2026-08-06', e, 'comercial', 'internal'),
    ('Cerrar convenio de patrocinio', 'OPEN', 'HIGH', 'HARD', v_pc, '2026-08-04', e, 'comercial', 'internal');

  -- ── 2) EVENTO · música con cover (Bruma MZT) ───────────────────────────────
  insert into event_plans (bu_id, name, description, kind, event_type, date, start_time, end_time,
    has_cover, cover_price, expected_attendance, requirements, collaborators, responsible, status)
  values (v_bm, 'Bruma Sessions: Techno Sunset',
    'Sesión de atardecer con DJ invitado; barra especial de mezcales.',
    'evento', 'musica', '2026-08-08', '18:00', '01:00', true, 250, 200,
    'cabina completa, humo, visuales', 'DJ invitado GDL', v_resp, 'planning')
  returning id into e;
  insert into project_resources (event_id, name, qty, unit_cost) values
    (e, 'Barback', 2, 600), (e, 'Ingeniero de audio', 1, 1500);
  insert into project_budget_items (event_id, concept, amount, is_income) values
    (e, 'Honorarios DJ invitado', 8000, false), (e, 'Visuales y humo', 2500, false);
  insert into tasks (title, status, priority, deadline_type, bu_id, due_date, event_id, area, client_impact) values
    ('Anunciar cartelera en IG', 'DONE', 'MEDIUM', 'SOFT', v_bm, '2026-08-04', e, 'marketing', 'client_facing'),
    ('Prueba de sonido', 'OPEN', 'HIGH', 'HARD', v_bm, '2026-08-08', e, 'piso', 'client_facing'),
    ('Coordinar hospedaje del DJ', 'OPEN', 'MEDIUM', 'SOFT', v_bm, '2026-08-07', e, 'talento', 'internal');

  -- ── 3) ADECUACIÓN de espacio (Oyster CLUB, 2 semanas) ──────────────────────
  insert into event_plans (bu_id, name, description, kind, date, end_date, requirements, responsible, status)
  values (v_oc, 'Adecuación barra exterior — Roof',
    'Ampliar la barra exterior del roof: cubierta, tarja doble y estación de hielo.',
    'adecuacion', '2026-08-11', '2026-08-22', 'obra en horario matutino, sin cerrar operación', v_resp, 'planning')
  returning id into e;
  insert into project_resources (event_id, name, qty, unit_cost) values
    (e, 'Carpintero', 1, null), (e, 'Electricista', 1, null);
  insert into project_budget_items (event_id, concept, amount, is_income) values
    (e, 'Madera y herrajes', 18000, false), (e, 'Mano de obra', 25000, false);
  insert into tasks (title, status, priority, deadline_type, bu_id, due_date, event_id, area, client_impact) values
    ('Aprobar diseño y cotización final', 'DONE', 'HIGH', 'HARD', v_oc, '2026-08-08', e, 'direccion', 'internal'),
    ('Comprar materiales', 'OPEN', 'HIGH', 'HARD', v_oc, '2026-08-10', e, 'comercial', 'internal'),
    ('Supervisión de obra semana 1', 'OPEN', 'MEDIUM', 'SOFT', v_oc, '2026-08-15', e, 'mantenimiento', 'internal'),
    ('Instalación eléctrica y prueba', 'OPEN', 'MEDIUM', 'HARD', v_oc, '2026-08-21', e, 'mantenimiento', 'internal');

  -- ── 4) REMODELACIÓN (Casa Ajeno, un mes) ───────────────────────────────────
  insert into event_plans (bu_id, name, description, kind, date, end_date, requirements, responsible, status)
  values (v_ca, 'Remodelación de terraza',
    'Renovación completa de la terraza: piso, pérgola, mobiliario e iluminación.',
    'remodelacion', '2026-08-17', '2026-09-12', 'terraza cerrada durante la obra; salón opera normal', v_resp, 'idea')
  returning id into e;
  insert into project_resources (event_id, name, qty, unit_cost) values
    (e, 'Arquitecto', 1, null), (e, 'Cuadrilla de obra', 4, null);
  insert into project_budget_items (event_id, concept, amount, is_income) values
    (e, 'Proyecto arquitectónico', 45000, false), (e, 'Obra civil y acabados', 120000, false),
    (e, 'Mobiliario exterior', 60000, false);
  insert into tasks (title, status, priority, deadline_type, bu_id, due_date, event_id, area, client_impact) values
    ('Recibir 3 cotizaciones de obra', 'OPEN', 'HIGH', 'HARD', v_ca, '2026-08-12', e, 'direccion', 'internal'),
    ('Definir mobiliario y acabados', 'OPEN', 'MEDIUM', 'SOFT', v_ca, '2026-08-14', e, 'direccion', 'internal'),
    ('Plan de comunicación del cierre parcial', 'OPEN', 'MEDIUM', 'SOFT', v_ca, '2026-08-15', e, 'marketing', 'client_facing');

  -- ── 5) APERTURA (POD Mazatlán, agosto → septiembre) ────────────────────────
  insert into event_plans (bu_id, name, description, kind, date, end_date, requirements, responsible, status)
  values (v_pm, 'Pre-apertura POD Mazatlán',
    'Puesta a punto para apertura: equipamiento, licencias, contratación y entrenamiento.',
    'apertura', '2026-08-24', '2026-09-30', 'checklist de apertura HOG', v_resp, 'planning')
  returning id into e;
  insert into project_resources (event_id, name, qty, unit_cost) values
    (e, 'Gerente de apertura', 1, null), (e, 'Staff en entrenamiento', 6, null);
  insert into project_budget_items (event_id, concept, amount, is_income) values
    (e, 'Equipamiento de cocina', 220000, false), (e, 'Licencias y permisos', 35000, false);
  insert into tasks (title, status, priority, deadline_type, bu_id, due_date, event_id, area, client_impact) values
    ('Tramitar licencias municipales', 'DONE', 'HIGH', 'HARD', v_pm, '2026-08-20', e, 'legal', 'internal'),
    ('Recibir e instalar equipo de cocina', 'OPEN', 'HIGH', 'HARD', v_pm, '2026-09-05', e, 'mantenimiento', 'internal'),
    ('Contratar y entrenar staff', 'OPEN', 'HIGH', 'HARD', v_pm, '2026-09-20', e, 'rrhh', 'internal');

  -- ── 6) MANTENIMIENTO exprés (Apricot MZT) — 100% completado ────────────────
  insert into event_plans (bu_id, name, description, kind, date, end_date, responsible, status)
  values (v_am, 'Mantenimiento A/C y refrigeración',
    'Servicio semestral de aires acondicionados y cámaras de refrigeración.',
    'mantenimiento', '2026-08-05', '2026-08-06', v_resp, 'done')
  returning id into e;
  insert into project_resources (event_id, name, qty, unit_cost) values (e, 'Técnico HVAC', 2, 1800);
  insert into project_budget_items (event_id, concept, amount, is_income) values (e, 'Refacciones y gas refrigerante', 6500, false);
  insert into tasks (title, status, priority, deadline_type, bu_id, due_date, event_id, area, client_impact) values
    ('Servicio a minisplits del salón', 'DONE', 'MEDIUM', 'HARD', v_am, '2026-08-05', e, 'mantenimiento', 'internal'),
    ('Revisión de cámaras de refrigeración', 'DONE', 'MEDIUM', 'HARD', v_am, '2026-08-06', e, 'mantenimiento', 'internal');

  -- ── Plantilla de arranque: "Evento tipo POD" ───────────────────────────────
  insert into project_templates (name, kind, event_type, resources, budget_items, task_bullets)
  select 'Evento tipo POD', 'evento', 'comunidad',
    '[{"name":"Bartender","qty":1,"unit_cost":1200},{"name":"Mesero","qty":2,"unit_cost":800},{"name":"Guardia de seguridad","qty":1,"unit_cost":900}]'::jsonb,
    '[{"concept":"Decoración","amount":2000,"is_income":false},{"concept":"Patrocinio de marca","amount":15000,"is_income":true}]'::jsonb,
    '- Confirmar DJ y rider' || chr(10) || '- Diseñar flyer' || chr(10) || '- Brief a cocina' || chr(10) || '- Cerrar convenio de patrocinio'
  where not exists (select 1 from project_templates where name = 'Evento tipo POD');

  raise notice 'Demo de Proyectos sembrada: 6 planes + plantilla.';
end $$;

-- ── LIMPIEZA (cuando quieras borrar la demo, descomenta y corre) ─────────────
-- delete from tasks where event_id in (select id from event_plans where name in (
--   'Noche Nacional — Comunidad POD','Bruma Sessions: Techno Sunset','Adecuación barra exterior — Roof',
--   'Remodelación de terraza','Pre-apertura POD Mazatlán','Mantenimiento A/C y refrigeración'));
-- delete from event_plans where name in (
--   'Noche Nacional — Comunidad POD','Bruma Sessions: Techno Sunset','Adecuación barra exterior — Roof',
--   'Remodelación de terraza','Pre-apertura POD Mazatlán','Mantenimiento A/C y refrigeración');
-- delete from project_templates where name = 'Evento tipo POD';
