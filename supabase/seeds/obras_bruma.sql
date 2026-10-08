-- ═════════════════════════════════════════════════════════════════════════════
-- OBRAS · Plan de remodelación de Bruma (Mazatlán) — DATOS DE ARRANQUE
--
-- El plan que ya se venía trabajando en la hoja compartida, ahora como obra
-- en HOG APP con su link público. Código fijo: BRUMA1 → /?obra=BRUMA1
--
-- Requiere obras.sql. Idempotente: si la obra BRUMA1 ya existe, no hace nada.
-- Autor: pon tu correo de HOG APP en TU-CORREO@dominio.com (o déjalo null).
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_obra uuid; g uuid; v_bu uuid; v_autor uuid;
begin
  if exists (select 1 from obras where code = 'BRUMA1') then
    raise notice 'La obra BRUMA1 ya existe — no se vuelve a sembrar.';
    return;
  end if;

  select id into v_bu from business_units where code = 'BM';
  select id into v_autor from profiles where email = 'TU-CORREO@dominio.com';

  insert into obras (bu_id, code, nombre, descripcion, meta_fecha, created_by)
  values (v_bu, 'BRUMA1', 'Remodelación de Bruma',
    'Marca cada tarea cuando quede terminada y pon la fecha en que la vas a hacer. Si algo se atora (falta material, falta alguien), escríbelo en la nota. Orden sugerido: primero electricidad y audio, luego techo y vidrios (obra sucia), después pintura, al final limpieza profunda y cocina.',
    '2026-11-13', v_autor)
  returning id into v_obra;

  -- 1 · Electricidad y audio
  insert into obra_grupos (obra_id, nombre, orden) values (v_obra, 'Electricidad y audio', 1) returning id into g;
  insert into obra_tareas (obra_id, grupo_id, orden, titulo, detalle, hecho, fecha_plan) values
    (v_obra, g, 1, 'Habilitar el centro de carga que alimenta el booth de DJ', 'Hecho el 7 de octubre.', true, '2026-10-07'),
    (v_obra, g, 2, 'Probar el equipo del booth de DJ con el nuevo centro de carga', 'Encender todo, revisar que no bote el breaker, dejar funcionando 1 hora.', false, null),
    (v_obra, g, 3, 'Bajar la bocina HK de Apricot e instalarla en Bruma', 'Pedir ayuda para bajarla; revisar soporte y cable antes de colgar.', false, null),
    (v_obra, g, 4, 'Conectar el cable del bajo (subwoofer)', 'Probar sonido completo después de conectar.', false, null),
    (v_obra, g, 5, 'Habilitar el nuevo contacto eléctrico de la sala 1 (entrada secundaria)', 'Contacto con tapa; probar con un aparato.', false, null);

  -- 2 · Iluminación LED
  insert into obra_grupos (obra_id, nombre, orden) values (v_obra, 'Iluminación LED', 2) returning id into g;
  insert into obra_tareas (obra_id, grupo_id, orden, titulo, detalle, requiere_dinero) values
    (v_obra, g, 1, 'Cambiar las tiras LED del rack de vinilos', null, true),
    (v_obra, g, 2, 'Sustituir las tiras LED de la barra', null, true),
    (v_obra, g, 3, 'Reacondicionar la tira LED de abajo de la barra', 'Revisar fuente y conectores; fijar bien para que no se despegue.', false);

  -- 3 · Obra y reparaciones
  insert into obra_grupos (obra_id, nombre, orden) values (v_obra, 'Obra y reparaciones', 3) returning id into g;
  insert into obra_tareas (obra_id, grupo_id, orden, titulo, detalle, requiere_dinero, ejecutor) values
    (v_obra, g, 1, 'Reparar el pedazo de techo que se está cayendo', 'Quitar lo flojo, resanar y dejar listo para pintar. Antes de pintar.', true, null),
    (v_obra, g, 2, 'Cambiar los vidrios rotos de la puerta de dos aguas', 'Medir, cotizar y sustituir; retirar vidrios rotos con guantes.', true, null),
    (v_obra, g, 3, 'Reparación de la cocina', 'Lo que esté dañado: plomería, desagüe, campana, superficies.', true, 'Daniel Mantenimiento');

  -- 4 · Pintura y limpieza
  insert into obra_grupos (obra_id, nombre, orden) values (v_obra, 'Pintura y limpieza', 4) returning id into g;
  insert into obra_tareas (obra_id, grupo_id, orden, titulo, detalle, requiere_dinero) values
    (v_obra, g, 1, 'Limpieza del techo y pintura nueva', 'Después de la reparación del techo. Cubrir barra y equipo antes de pintar.', true),
    (v_obra, g, 2, 'Limpieza profunda de toda la barra', 'Por dentro y por fuera: refrigeradores, tarjas, repisas, piso debajo de la barra.', false);

  -- 5 · Cocina lista para entregar al chef
  insert into obra_grupos (obra_id, nombre, orden) values (v_obra, 'Cocina lista para entregar al chef', 5) returning id into g;
  insert into obra_tareas (obra_id, grupo_id, orden, titulo, detalle, requiere_dinero, ejecutor) values
    (v_obra, g, 1, 'Vaciar y lavar a fondo toda la cocina', 'Paredes, piso, campana, tarjas, estufa, refrigeradores por dentro.', false, null),
    (v_obra, g, 2, 'Revisar que funcione cada equipo: estufa, campana, refrigeración, plancha, freidora', 'Anotar lo que no sirve o necesita servicio.', false, null),
    (v_obra, g, 3, 'Inventario de loza, ollas, sartenes y utensilios', 'Lista con cantidad y estado (bueno / dañado / falta).', false, null),
    (v_obra, g, 4, 'Reacomodar la cocina por estaciones: fríos, calientes, lavado, almacén seco', 'Dejar libre el paso y las salidas.', false, null),
    (v_obra, g, 5, 'Revisar gas, agua y desagüe', 'Sin fugas, con presión, desagüe destapado.', false, null),
    (v_obra, g, 6, 'Fumigación preventiva', 'Una semana antes de reabrir.', true, 'Servicio Técnico de Plagas'),
    (v_obra, g, 7, 'Recorrido final con el chef y entrega con checklist firmado', null, false, null);

  raise notice 'Obra BRUMA1 sembrada: 5 grupos, 20 tareas. Link: /?obra=BRUMA1';
end $$;
