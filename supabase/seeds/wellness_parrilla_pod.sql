-- ═════════════════════════════════════════════════════════════════════════════
-- POD WELLNESS · MAESTROS Y PARRILLA REALES
--
-- Da de alta a los cinco maestros, las ocho clases y los quince horarios que
-- opera POD Wellness hoy. Sin esto la app está vacía y el portal público no
-- tiene nada que mostrar.
--
-- El venue va fijado abajo en v_code. Si el código no existe, el script se
-- detiene y te lista los que sí hay, en vez de crear las clases colgando de
-- la casa equivocada.
--
-- Es idempotente: correrlo dos veces no duplica nada. Si ya editaste un
-- horario a mano, la segunda corrida respeta lo que hay (usa on conflict).
--
-- Requiere wellness.sql y wellness_operacion.sql.
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  -- La casa de POD Wellness en HOG APP
  v_code   text := 'NUEVOLEON108';
  -- wellness.sql sembró un Dharma Yoga de ejemplo en martes y jueves 07:30.
  -- Con esto en true, cualquier horario de estas clases que NO esté en la
  -- parrilla oficial queda EN PAUSA (no se borra: se reactiva desde
  -- Wellness → Parrilla si de verdad lo usas). Ponlo en false si prefieres
  -- que no se toque nada de lo que ya existe.
  v_pausar_sobrantes boolean := true;
  v_sobrantes text;
  v_bu     uuid;
  v_rafa   uuid; v_alma uuid; v_yanni uuid; v_salva uuid; v_shanti uuid;
  v_dharma uuid; v_runners uuid; v_hatha uuid; v_sculpt uuid;
  v_power  uuid; v_pisoP uuid; v_vinyasa uuid; v_yin uuid;
  v_precio numeric;
begin
  select id into v_bu from business_units where upper(code) = upper(v_code);
  if v_bu is null then
    raise exception 'No existe la casa con código "%". Cambia v_code arriba por el código real de POD Wellness. Códigos disponibles: %',
      v_code, (select string_agg(code, ', ' order by code) from business_units);
  end if;

  -- El precio de la clase sigue al precio vigente del venue si ya está
  -- configurado (300 con -40 = 260); si no, arranca en 300.
  select coalesce(precio_vigente, 300) into v_precio from wellness_config where bu_id = v_bu;
  v_precio := coalesce(v_precio, 300);

  -- ── Maestros ──────────────────────────────────────────────────────────────
  -- Se identifican por nombre dentro de la casa: correr esto dos veces no
  -- crea un segundo "Rafa".
  insert into wellness_instructors (bu_id, full_name, estatus, active)
  select v_bu, x.nombre, 'confirmado', true
    from (values ('Rafa'), ('Alma'), ('Yanni Mejía'), ('Salvador Petrola'), ('Shanti')) as x(nombre)
   where not exists (select 1 from wellness_instructors i where i.bu_id = v_bu and lower(i.full_name) = lower(x.nombre));

  select id into v_rafa   from wellness_instructors where bu_id = v_bu and full_name = 'Rafa';
  select id into v_alma   from wellness_instructors where bu_id = v_bu and full_name = 'Alma';
  select id into v_yanni  from wellness_instructors where bu_id = v_bu and full_name = 'Yanni Mejía';
  select id into v_salva  from wellness_instructors where bu_id = v_bu and full_name = 'Salvador Petrola';
  select id into v_shanti from wellness_instructors where bu_id = v_bu and full_name = 'Shanti';

  -- ── Clases ────────────────────────────────────────────────────────────────
  -- Todas son multinivel: va en la descripción, que es lo que ve el alumno.
  insert into wellness_classes (bu_id, name, description, instructor_id, price, capacity, duration_min, color, active)
  select v_bu, x.nombre, 'Multinivel', x.maestro, v_precio, 12, 60, '#1D9E75', true
    from (values
      ('Dharma Yoga',                v_rafa),
      ('Yoga para Runners 🌈',       v_rafa),
      ('Hatha Yoga',                 v_alma),
      ('Sculpt n Burn Pilates',      v_yanni),
      ('Power Yoga',                 v_salva),
      ('Pilates de piso',            v_salva),
      ('Vinyasa Yoga',               v_shanti),
      ('Yin Yoga',                   v_shanti)
    ) as x(nombre, maestro)
   where not exists (select 1 from wellness_classes c where c.bu_id = v_bu and lower(c.name) = lower(x.nombre));

  -- Si la clase ya existía sin maestro (o con otro), se le pone el de la
  -- parrilla real: es la fuente de verdad de quién imparte qué.
  update wellness_classes c set instructor_id = x.maestro
    from (values
      ('Dharma Yoga', v_rafa), ('Yoga para Runners 🌈', v_rafa), ('Hatha Yoga', v_alma),
      ('Sculpt n Burn Pilates', v_yanni), ('Power Yoga', v_salva), ('Pilates de piso', v_salva),
      ('Vinyasa Yoga', v_shanti), ('Yin Yoga', v_shanti)
    ) as x(nombre, maestro)
   where c.bu_id = v_bu and lower(c.name) = lower(x.nombre)
     and c.instructor_id is distinct from x.maestro;

  select id into v_dharma  from wellness_classes where bu_id = v_bu and name = 'Dharma Yoga';
  select id into v_runners from wellness_classes where bu_id = v_bu and name = 'Yoga para Runners 🌈';
  select id into v_hatha   from wellness_classes where bu_id = v_bu and name = 'Hatha Yoga';
  select id into v_sculpt  from wellness_classes where bu_id = v_bu and name = 'Sculpt n Burn Pilates';
  select id into v_power   from wellness_classes where bu_id = v_bu and name = 'Power Yoga';
  select id into v_pisoP   from wellness_classes where bu_id = v_bu and name = 'Pilates de piso';
  select id into v_vinyasa from wellness_classes where bu_id = v_bu and name = 'Vinyasa Yoga';
  select id into v_yin     from wellness_classes where bu_id = v_bu and name = 'Yin Yoga';

  -- ── Parrilla ──────────────────────────────────────────────────────────────
  -- weekday: 0 domingo … 6 sábado. El turno se deduce de la hora (antes de las
  -- 13:00 AM, después PM, sábado su propio turno), igual que en la app.
  insert into wellness_slots (class_id, weekday, start_time, instructor_id, turno, estatus, duration_min, notas, active)
  select x.clase, x.dia, x.hora, x.maestro,
         case when x.dia = 6 then 'SAB' when x.hora < time '13:00' then 'AM' else 'PM' end,
         'activa', 60, x.nota, true
    from (values
      -- Lunes
      (1, time '08:00', v_hatha,   v_alma,   'Arranca 2 de septiembre'),
      (1, time '18:00', v_pisoP,   v_salva,  'Arranca 7 de septiembre'),
      (1, time '19:30', v_yin,     v_shanti, 'Arranca 8 de septiembre'),
      -- Martes
      (2, time '07:00', v_power,   v_salva,  'Arranca 7 de septiembre'),
      (2, time '08:00', v_sculpt,  v_yanni,  null),
      (2, time '18:00', v_vinyasa, v_shanti, 'Arranca 8 de septiembre'),
      (2, time '19:30', v_dharma,  v_rafa,   null),
      -- Miércoles
      (3, time '08:00', v_hatha,   v_alma,   'Arranca 2 de septiembre'),
      (3, time '18:00', v_pisoP,   v_salva,  'Arranca 7 de septiembre'),
      (3, time '19:30', v_runners, v_rafa,   null),
      -- Jueves
      (4, time '07:00', v_power,   v_salva,  'Arranca 7 de septiembre'),
      (4, time '08:00', v_sculpt,  v_yanni,  null),
      (4, time '18:00', v_vinyasa, v_shanti, 'Arranca 8 de septiembre'),
      (4, time '19:30', v_dharma,  v_rafa,   null),
      -- Sábado
      (6, time '11:00', v_dharma,  v_rafa,   null)
    ) as x(dia, hora, clase, maestro, nota)
  -- do update, no do nothing: un horario que ya existía de una carga previa
  -- se completa con su maestro y su turno en vez de quedarse a medias.
  on conflict (class_id, weekday, start_time) do update set
    instructor_id = excluded.instructor_id,
    turno         = excluded.turno,
    estatus       = 'activa',
    active        = true,
    duration_min  = coalesce(wellness_slots.duration_min, excluded.duration_min),
    notas         = coalesce(wellness_slots.notas, excluded.notas);

  -- ── Lo que sobra de cargas anteriores ─────────────────────────────────────
  if v_pausar_sobrantes then
    with fuera as (
      update wellness_slots s set estatus = 'pausa', active = false
       from wellness_classes c
      where c.id = s.class_id and c.bu_id = v_bu
        and coalesce(s.estatus, 'activa') = 'activa'
        and not ((s.weekday, s.start_time) in (
          (1, time '08:00'), (1, time '18:00'), (1, time '19:30'),
          (2, time '07:00'), (2, time '08:00'), (2, time '18:00'), (2, time '19:30'),
          (3, time '08:00'), (3, time '18:00'), (3, time '19:30'),
          (4, time '07:00'), (4, time '08:00'), (4, time '18:00'), (4, time '19:30'),
          (6, time '11:00')))
      returning c.name, s.weekday, s.start_time)
    select string_agg(format('%s %s %s',
             case weekday when 0 then 'dom' when 1 then 'lun' when 2 then 'mar' when 3 then 'mié'
                          when 4 then 'jue' when 5 then 'vie' else 'sáb' end,
             to_char(start_time, 'HH24:MI'), name), ' · ')
      into v_sobrantes from fuera;
    if v_sobrantes is not null then
      raise notice 'Quedaron EN PAUSA (no en la parrilla oficial): %. Si alguno sí va, reactívalo en Wellness → Parrilla.', v_sobrantes;
    end if;
  end if;

  -- ── Qué imparte cada quien (el directorio de Maestros lo muestra) ─────────
  insert into wellness_instructor_classes (instructor_id, class_id)
  select c.instructor_id, c.id from wellness_classes c
   where c.bu_id = v_bu and c.instructor_id is not null
  on conflict do nothing;

  raise notice 'POD Wellness listo en % — % maestros, % clases, % horarios.',
    v_code,
    (select count(*) from wellness_instructors where bu_id = v_bu),
    (select count(*) from wellness_classes where bu_id = v_bu),
    (select count(*) from wellness_slots s join wellness_classes c on c.id = s.class_id where c.bu_id = v_bu);
end $$;

notify pgrst, 'reload schema';
