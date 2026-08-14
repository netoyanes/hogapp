-- ─────────────────────────────────────────────────────────────────────────────
-- PROYECTO DE PRUEBA — Kickoff de apertura hotelera con 4 áreas.
-- Ejercita todo lo nuevo: presupuesto unificado con tipo de gasto y zona,
-- programa de varios días, tareas de planeación y relacionados.
--
-- Cámbiale el venue y el correo antes de correrlo:
--   · code = 'PM'  → POD Mazatlán (ajústalo al venue que quieras)
--   · TU-CORREO@dominio.com → tu correo de HOG APP
-- Para deshacerlo: en la app, clic derecho sobre el proyecto → Archivar.
-- ─────────────────────────────────────────────────────────────────────────────
begin;

with proyecto as (
  insert into event_plans (
    bu_id, name, description, kind, date, end_date, event_type, status,
    budget, requirements, responsible, created_by
  ) values (
    (select id from business_units where code = 'PM'),
    'Kickoff apertura hotel — 4 áreas',
    'Arranque de operación del hotel: bar, restaurante, zona wellness y habitaciones. Incluye contratación, mobiliario, materiales de obra y equipo electrónico por área.',
    'apertura',
    current_date,
    current_date + 60,
    'otro',
    'planning',
    1850000,
    'Permisos vigentes, obra terminada en wellness antes del amueblado, internet y red instalados antes de montar equipo electrónico.',
    (select id from profiles where email = 'TU-CORREO@dominio.com'),
    (select id from profiles where email = 'TU-CORREO@dominio.com')
  ) returning id
),

-- ── TAREAS DE PLANEACIÓN: el trabajo previo, con fecha límite ──────────────
tareas as (
  insert into tasks (title, description, due_date, area, priority, estimated_hours,
                     deadline_type, status, client_impact, proof_required,
                     event_id, bu_id, created_by)
  select v.titulo, v.desc_, v.vence, v.area, v.prio, v.horas, v.dl,
         'OPEN', v.impacto, v.evidencia,
         p.id, (select id from business_units where code = 'PM'),
         (select id from profiles where email = 'TU-CORREO@dominio.com')
  from (values
    -- Contratación
    ('Definir organigrama y headcount por área',      'Cuántas personas por bar, restaurante, wellness y habitaciones.', current_date + 5,  'rrhh',          'HIGH',   8,  'HARD', 'internal', false),
    ('Publicar vacantes — bar y restaurante',         'Bartenders, meseros, cocina. Usar la bolsa de trabajo del Concierge.', current_date + 10, 'rrhh',       'HIGH',   6,  'SOFT', 'internal', false),
    ('Publicar vacantes — wellness y habitaciones',   'Terapeutas, recepción, housekeeping.',                            current_date + 12, 'rrhh',          'HIGH',   6,  'SOFT', 'internal', false),
    ('Entrevistas y selección final',                 'Terna por posición y decisión.',                                  current_date + 25, 'rrhh',          'HIGH',   24, 'HARD', 'internal', true),
    ('Contratos y alta en nómina',                    'Documentación completa antes del primer día.',                    current_date + 35, 'rrhh',          'HIGH',   10, 'HARD', 'internal', true),
    ('Capacitación de apertura — todas las áreas',    'Servicio, estándares de la casa, protocolos.',                    current_date + 50, 'rrhh',          'MEDIUM', 20, 'HARD', 'client_facing', false),
    -- Compras y obra
    ('Cotizar mobiliario de las 4 áreas',             'Mínimo 3 cotizaciones por rubro; adjuntarlas en el presupuesto.', current_date + 8,  'finanzas',      'HIGH',   12, 'HARD', 'internal', true),
    ('Cerrar proveedor de mobiliario',                'Negociación y anticipo.',                                         current_date + 15, 'comercial',     'HIGH',   6,  'HARD', 'internal', true),
    ('Terminar obra de la zona wellness',             'Sauna, vapor y área húmeda listas para amueblar.',                current_date + 30, 'mantenimiento', 'HIGH',   40, 'HARD', 'internal', true),
    ('Instalar red e internet en todo el hotel',      'Cableado y cobertura wifi por piso.',                             current_date + 20, 'tecnologia',    'HIGH',   16, 'HARD', 'internal', false),
    ('Montar equipo electrónico por área',            'TVs, audio, POS, cerraduras electrónicas.',                       current_date + 40, 'tecnologia',    'MEDIUM', 24, 'HARD', 'internal', true),
    ('Recibir y acomodar mobiliario',                 'Revisión contra pedido y acomodo por zona.',                      current_date + 45, 'mantenimiento', 'MEDIUM', 16, 'SOFT', 'internal', false),
    -- Operación y arranque
    ('Definir carta del restaurante y del bar',       'Menú de apertura y costeo por platillo.',                         current_date + 28, 'direccion',     'HIGH',   14, 'HARD', 'client_facing', false),
    ('Definir menú de servicios wellness',            'Masajes, faciales, rituales y duraciones.',                       current_date + 28, 'direccion',     'MEDIUM', 8,  'SOFT', 'client_facing', false),
    ('Cargar tarifas de habitaciones y políticas',    'Tarifario por temporada, check-in/out, cancelación.',             current_date + 33, 'direccion',     'HIGH',   6,  'HARD', 'client_facing', false),
    ('Plan de marketing de apertura',                 'Contenido, invitados y campaña previa.',                          current_date + 38, 'marketing',     'MEDIUM', 18, 'SOFT', 'client_facing', false),
    ('Simulacro de operación (soft opening interno)', 'Prueba completa con staff, sin público.',                         current_date + 55, 'piso',          'HIGH',   12, 'HARD', 'internal', true)
  ) as v(titulo, desc_, vence, area, prio, horas, dl, impacto, evidencia)
  cross join proyecto p
  returning 1
),

-- ── PRESUPUESTO: partidas por tipo de gasto y por zona ─────────────────────
presupuesto as (
  insert into project_budget_items (event_id, concept, amount, is_income, category, area, qty, unit_cost, notes)
  select p.id, b.concepto, b.unitario * b.cantidad, false, b.tipo, b.zona, b.cantidad, b.unitario, b.nota
  from (values
    -- PERSONAL (costo del primer mes por posición)
    ('Bartenders',                       'personal',   'Bar',          3,  18000, 'Sueldo primer mes'),
    ('Meseros',                          'personal',   'Restaurante',  6,  14000, 'Sueldo primer mes'),
    ('Cocineros',                        'personal',   'Restaurante',  4,  22000, 'Sueldo primer mes'),
    ('Terapeutas',                       'personal',   'Wellness',     3,  20000, 'Sueldo primer mes'),
    ('Recepción',                        'personal',   'Habitaciones', 4,  16000, 'Turnos rotativos'),
    ('Housekeeping',                     'personal',   'Habitaciones', 6,  13000, 'Sueldo primer mes'),
    -- MOBILIARIO
    ('Barra principal a medida',         'mobiliario', 'Bar',          1,  180000, 'Carpintería + herrería'),
    ('Bancos de barra',                  'mobiliario', 'Bar',          14, 3200,  null),
    ('Mesas de comedor',                 'mobiliario', 'Restaurante',  22, 5800,  null),
    ('Sillas de comedor',                'mobiliario', 'Restaurante',  88, 2100,  null),
    ('Camillas de masaje',               'mobiliario', 'Wellness',     4,  28000, 'Eléctricas, altura ajustable'),
    ('Lockers de vestidor',              'mobiliario', 'Wellness',     2,  34000, 'Módulos de 12'),
    ('Camas king con base',              'mobiliario', 'Habitaciones', 18, 24000, null),
    ('Amenidades y textiles de cuarto',  'mobiliario', 'Habitaciones', 18, 7500,  'Blancos, toallas, batas'),
    -- MATERIALES DE OBRA Y ACABADOS
    ('Acabados zona húmeda',             'materiales', 'Wellness',     1,  240000, 'Sauna y vapor'),
    ('Pintura y acabados generales',     'materiales', 'Habitaciones', 1,  95000,  null),
    ('Plantas y jardinería interior',    'materiales', 'Restaurante',  40, 1200,   'Macetas y follaje'),
    ('Iluminación decorativa',           'materiales', 'Bar',          1,  68000,  'Luz indirecta y lámparas'),
    -- EQUIPO ELECTRÓNICO
    ('Sistema de audio multizona',       'equipo',     'Bar',          1,  145000, 'Bar + restaurante'),
    ('Pantallas',                        'equipo',     'Habitaciones', 18, 9800,   'Smart TV por cuarto'),
    ('Cerraduras electrónicas',          'equipo',     'Habitaciones', 18, 6400,   'Con tarjeta y app'),
    ('Terminales punto de venta',        'equipo',     'Restaurante',  4,  18000,  'POS + impresora'),
    ('Equipo de cocina industrial',      'equipo',     'Restaurante',  1,  420000, 'Plancha, hornos, refrigeración'),
    ('Red y wifi de todo el hotel',      'equipo',     'Habitaciones', 1,  185000, 'Cableado + access points'),
    -- SERVICIOS Y MARKETING
    ('Consultoría de operación hotelera','servicios',  'Habitaciones', 1,  120000, 'Manuales y estándares'),
    ('Campaña de apertura',              'marketing',  'Habitaciones', 1,  150000, 'Contenido, pauta y prensa'),
    ('Fotografía y video del hotel',     'marketing',  'Habitaciones', 1,  85000,  'Todas las áreas')
  ) as b(concepto, tipo, zona, cantidad, unitario, nota)
  cross join proyecto p
  returning 1
)

-- ── PROGRAMA: la semana de apertura, día por día ───────────────────────────
insert into project_activities (event_id, date, start_time, end_time, title, location, status)
select p.id, a.dia, a.ini, a.fin, a.titulo, a.lugar, 'planeada'
from (values
  (current_date + 56, '09:00', '11:00', 'Junta general de arranque con todo el staff', 'Salón principal'),
  (current_date + 56, '12:00', '18:00', 'Montaje final de las 4 áreas',                 null),
  (current_date + 57, '10:00', '14:00', 'Prueba de servicio — restaurante',             'Restaurante'),
  (current_date + 57, '17:00', '21:00', 'Prueba de servicio — bar',                     'Bar'),
  (current_date + 58, '10:00', '14:00', 'Prueba de servicio — wellness',                'Zona wellness'),
  (current_date + 58, '15:00', '18:00', 'Prueba de check-in y housekeeping',            'Recepción'),
  (current_date + 59, '11:00', '15:00', 'Ajustes finales y revisión de pendientes',     null),
  (current_date + 60, '18:00', '23:00', 'Soft opening con invitados',                   'Todo el hotel')
) as a(dia, ini, fin, titulo, lugar)
cross join proyecto p;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- RESUMEN: 1 proyecto de apertura (60 días) + 17 tareas de planeación
-- + 28 partidas de presupuesto en 4 zonas (bar, restaurante, wellness,
-- habitaciones) y 6 tipos de gasto + 8 actividades de la semana de apertura.
-- SUPUESTOS: venue 'PM' y fechas relativas a hoy. Montos ilustrativos.
-- FALTA: sustituir TU-CORREO@dominio.com y ajustar el código de venue.
-- ─────────────────────────────────────────────────────────────────────────────
