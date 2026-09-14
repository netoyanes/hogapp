-- ═════════════════════════════════════════════════════════════════════════════
-- APERTURAS · PLANEACIÓN DE NUEVOS LOCALES
--
-- Abrir un local se planea hoy en tres archivos que nadie sincroniza: un Excel
-- de presupuesto, un Gantt en otra herramienta y un chat donde viven los
-- proveedores. Mueves una fecha y el flujo de caja se queda con la vieja.
--
-- Aquí solo existe la PARTIDA. Una partida tiene tres caras —cuándo, cuánto y
-- con quién— y de ella se derivan la ruta crítica, el flujo de caja, el avance
-- y las alertas. Nada de eso se guarda: se calcula (src/lib/aperturas/motor.ts).
-- Si se pudiera derivar y aun así se guardara, tarde o temprano se contradice.
--
-- ACCESO: solo MASTER, en las tres tablas. Un presupuesto de apertura trae
-- rentas, traspasos y márgenes de proveedor; no es información de operación.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1. Proyecto ─────────────────────────────────────────────────────────────
create table if not exists aperturas_proyectos (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  ciudad        text not null default 'CDMX',
  inicio        date not null default current_date,
  meta_apertura date not null,
  presupuesto_aprobado numeric(12,2) not null default 0,
  -- Fracción, no porcentaje: 0.10 = 10%. Es el colchón de imprevistos y NO
  -- forma parte de lo que se puede comprometer.
  reserva_pct   numeric(4,3) not null default 0.10,
  -- Cuando la apertura ya tiene venue en HOG APP, se amarra. Antes de eso es
  -- normal que no exista todavía.
  bu_id         uuid references business_units(id) on delete set null,
  notas         text,
  -- Foto del plan al momento de fijarlo: { partida_id: {dias, monto, depende_de} }.
  -- Sin línea base no hay forma de contestar "¿esto ya se movió?", que es la
  -- primera pregunta de cualquier junta de obra.
  linea_base    jsonb,
  linea_base_at timestamptz,
  archivado     boolean not null default false,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null
);

-- ─── 2. Proveedores ──────────────────────────────────────────────────────────
-- Deliberadamente GLOBALES, no por proyecto: el carpintero que hizo la barra
-- de la primera apertura es el mismo de la segunda, y su porcentaje de
-- anticipo es lo que de verdad vale la pena recordar entre aperturas.
create table if not exists aperturas_proveedores (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  -- taller | contratista | tienda_linea | tienda_fisica | interno
  tipo         text not null default 'contratista',
  oficio       text,
  -- Manda sobre CUÁNDO cae el dinero de todas sus partidas: el anticipo el día
  -- que arranca, el saldo el día que termina.
  anticipo_pct numeric(4,3) not null default 0,
  contacto     text,
  dominio      text,
  notas        text,
  activo       boolean not null default true,
  created_at   timestamptz not null default now()
);

comment on column aperturas_proveedores.anticipo_pct is 'Fracción que se paga al arrancar. 0.5 = mitad y mitad.';

-- ─── 3. Partidas ─────────────────────────────────────────────────────────────
-- Una tabla para los tres subtipos. Separarlos en tres tablas obligaría a
-- unirlas en cada consulta del cronograma y del flujo, que las leen todas.
create table if not exists aperturas_partidas (
  id           uuid primary key default gen_random_uuid(),
  proyecto_id  uuid not null references aperturas_proyectos(id) on delete cascade,
  nombre       text not null,
  fase         text not null default 'Obra',
  -- compra | trabajo | tarea
  tipo         text not null default 'tarea',
  -- Ids de partidas que deben terminar antes. El motor ignora las que ya no
  -- existen, así que borrar una partida no congela a las demás.
  depende_de   uuid[] not null default '{}',
  proveedor_id uuid references aperturas_proveedores(id) on delete set null,
  -- 0–100. Lo único del avance que nadie puede calcular: se captura a mano.
  avance       int not null default 0 check (avance between 0 and 100),
  anticipo_pagado boolean not null default false,
  saldo_pagado    boolean not null default false,
  -- El campo más importante del tablero: dinero que todavía puede moverse.
  estimado     boolean not null default true,
  -- Fase 2: cuenta en presupuesto y en flujo, pero NO condiciona la apertura.
  -- Sin esta bandera, la terraza que se termina en octubre haría que el
  -- cronograma gritara "no llegas" todos los días.
  post_apertura boolean not null default false,
  -- Piso de arranque por un tercero, no por la obra: el electricista que hasta
  -- el viernes se desocupa. Sin esto el cronograma promete arranques que nadie
  -- va a cumplir.
  no_antes_de  date,
  notas        text,

  -- Compra
  url             text,
  foto            text,
  precio_unitario numeric(12,2),
  cantidad        numeric(12,2),
  -- Para una compra, la duración en el cronograma ES el tiempo de entrega.
  dias_entrega    int,

  -- Trabajo
  oficio          text,
  dias_ejecucion  int,

  -- Tarea
  responsable     text,
  dias            int,
  costo           numeric(12,2),

  orden        int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists aperturas_partidas_proyecto_idx on aperturas_partidas (proyecto_id, orden);

-- ─── 4. RLS: solo MASTER ─────────────────────────────────────────────────────
alter table aperturas_proyectos   enable row level security;
alter table aperturas_proveedores enable row level security;
alter table aperturas_partidas    enable row level security;

do $g$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    drop policy if exists aperturas_proyectos_all   on aperturas_proyectos;
    drop policy if exists aperturas_proveedores_all on aperturas_proveedores;
    drop policy if exists aperturas_partidas_all    on aperturas_partidas;
    create policy aperturas_proyectos_all on aperturas_proyectos
      for all to authenticated using (hog_role() = 'MASTER') with check (hog_role() = 'MASTER');
    create policy aperturas_proveedores_all on aperturas_proveedores
      for all to authenticated using (hog_role() = 'MASTER') with check (hog_role() = 'MASTER');
    create policy aperturas_partidas_all on aperturas_partidas
      for all to authenticated using (hog_role() = 'MASTER') with check (hog_role() = 'MASTER');
  end if;
end $g$;

notify pgrst, 'reload schema';
