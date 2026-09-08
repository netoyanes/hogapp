-- ═════════════════════════════════════════════════════════════════════════════
-- WELLNESS · CATÁLOGO DE PRODUCTOS Y MOTOR DE CRÉDITOS
--
-- Hasta ahora solo existía la clase suelta: cada reserva cobraba un precio y
-- ahí terminaba. La estrategia de precios introduce cuatro formas más de vender
-- —semana de prueba, paquetes de 5 y 10, membresía ilimitada— y todas comparten
-- la misma mecánica: se compran una vez y se consumen clase por clase.
--
-- TRES PIEZAS:
--   · wellness_products   el catálogo. Precio, créditos y vigencia son DATOS,
--                         no código: cambiar el paquete 10 de $2,400 a $2,600
--                         es un update, no un despliegue.
--   · wellness_purchases  lo que alguien compró y cuánto le queda.
--   · el consumo          fn_wellness_book elige sola la mejor compra vigente
--                         y descuenta el crédito.
--
-- EL VALOR ATRIBUIDO es la razón por la que esto no puede vivir solo en la UI.
-- Al maestro se le paga el mayor entre su tabulador y el 50% del valor de las
-- visitas de su clase, y una visita NO vale lo mismo según con qué se pagó:
-- suelta $300, paquete 5 $270, paquete 10 $240, membresía $220, prueba $170.
-- Ese número se congela en la reserva al momento de reservar — si mañana suben
-- los precios, lo ya impartido no cambia de valor retroactivamente.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Requiere wellness.sql, wellness_alumnos.sql y wellness_ticket.sql.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1. Catálogo ─────────────────────────────────────────────────────────────
create table if not exists wellness_products (
  id            uuid primary key default gen_random_uuid(),
  bu_id         uuid not null references business_units(id) on delete cascade,
  code          text not null,
  nombre        text not null,
  descripcion   text,
  -- suelta | prueba | paquete | membresia
  tipo          text not null,
  precio        numeric(10,2) not null,
  -- NULL = ilimitado dentro de la vigencia (prueba y membresía)
  creditos      int,
  vigencia_dias int not null,
  -- Lo que vale una visita pagada con esto, para el cálculo del maestro
  valor_visita  numeric(10,2) not null,
  -- La semana de prueba arranca en la PRIMERA CLASE, no al comprarse: quien la
  -- compra el jueves y viene hasta el lunes no perdió cuatro días.
  inicia_en_primera_clase boolean not null default false,
  una_vez_por_persona     boolean not null default false,
  -- Tope de compras vivas (fundador: 30). NULL = sin tope.
  cupo_total    int,
  -- Última fecha en que se puede comprar. NULL = sin límite.
  vigente_hasta date,
  -- Días de anticipación con que puede reservar quien tiene esto activo
  reserva_dias_antes int not null default 3,
  orden         int not null default 0,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (bu_id, code)
);

comment on column wellness_products.valor_visita is 'Valor atribuido a una visita pagada con este producto, para el cálculo del pago a maestros.';
comment on column wellness_products.creditos is 'Número de clases. NULL = ilimitado dentro de la vigencia.';

-- ─── 2. Lo comprado ──────────────────────────────────────────────────────────
create table if not exists wellness_purchases (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references wellness_students(id) on delete cascade,
  product_id    uuid not null references wellness_products(id),
  code          text,
  precio        numeric(10,2) not null,
  creditos_totales int,
  creditos_usados  int not null default 0,
  -- NULL mientras no arranque (productos que inician en la primera clase)
  inicia        date,
  vence         date,
  -- pendiente_pago | activa | agotada | vencida | cancelada
  status        text not null default 'pendiente_pago',
  paid          boolean not null default false,
  paid_via      text,
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists wellness_purchases_student_idx on wellness_purchases (student_id, status);
create unique index if not exists wellness_purchases_code_uk on wellness_purchases (code);

-- El mismo código legible de las reservas: se dicta en caja sin errores.
create or replace function public.fn_wellness_set_purchase_code()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.code is null then new.code := public.fn_wellness_gen_code(); end if;
  return new;
end $fn$;

drop trigger if exists trg_wellness_purchase_code on wellness_purchases;
create trigger trg_wellness_purchase_code
  before insert on wellness_purchases
  for each row execute function public.fn_wellness_set_purchase_code();

-- ─── 3. La reserva recuerda con qué se pagó y cuánto valió ───────────────────
alter table wellness_bookings add column if not exists purchase_id uuid references wellness_purchases(id);
alter table wellness_bookings add column if not exists valor_atribuido numeric(10,2);

comment on column wellness_bookings.valor_atribuido is 'Valor de esta visita para el pago al maestro. Se congela al reservar.';

-- ─── 4. Tope de membresías ───────────────────────────────────────────────────
-- Con cupo 12 una ilimitada consume ~9 lugares al mes. Si los miembros pasan
-- del 55% de los lugares reales, la gente de paquete deja de encontrar clase y
-- se corta la captación. El tope es parte del producto, no una salvaguarda.
alter table wellness_config add column if not exists tope_membresias int not null default 30;
comment on column wellness_config.tope_membresias is 'Máximo de membresías vivas a la vez. 30 con cupo 12, 40 con cupo 15.';

-- ─── 5. RLS ──────────────────────────────────────────────────────────────────
alter table wellness_products  enable row level security;
alter table wellness_purchases enable row level security;

-- El catálogo y las compras se leen por RPC security-definer, no por tabla.
-- Sin políticas, anon no ve nada directo — que es justo lo que se quiere.
do $g$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    drop policy if exists wellness_products_lectura on wellness_products;
    create policy wellness_products_lectura on wellness_products
      for select to authenticated using (true);
    drop policy if exists wellness_purchases_lectura on wellness_purchases;
    create policy wellness_purchases_lectura on wellness_purchases
      for select to authenticated using (true);
  end if;
end $g$;

-- ─── 6. Catálogo de POD Condesa ──────────────────────────────────────────────
insert into wellness_products
  (bu_id, code, nombre, descripcion, tipo, precio, creditos, vigencia_dias,
   valor_visita, inicia_en_primera_clase, una_vez_por_persona, cupo_total,
   vigente_hasta, reserva_dias_antes, orden)
select b.id, x.code, x.nombre, x.descripcion, x.tipo, x.precio, x.creditos,
       x.vigencia, x.valor, x.inicia_primera, x.una_vez, x.cupo, x.hasta, x.dias_antes, x.orden
  from business_units b, (values
    ('suelta',    'Clase suelta',        'Una clase, el día que quieras.',
     'suelta',     300::numeric, 1,    1,  300::numeric, false, false, null::int, null::date, 3, 10),
    ('prueba',    'Semana de prueba',    'Siete días de clases ilimitadas. Arranca en tu primera clase.',
     'prueba',     500::numeric, null, 7,  170::numeric, true,  true,  null::int, null::date, 3, 20),
    ('paq5',      'Paquete 5 clases',    'Para venir una vez por semana. Vigencia de 45 días.',
     'paquete',   1350::numeric, 5,    45, 270::numeric, false, false, null::int, null::date, 3, 30),
    ('paq10',     'Paquete 10 clases',   'Para venir dos veces por semana. Vigencia de 90 días.',
     'paquete',   2400::numeric, 10,   90, 240::numeric, false, false, null::int, null::date, 3, 40),
    ('fundador',  'Membresía fundador',  'Ilimitada con precio congelado 6 meses. Solo los primeros 30.',
     'membresia', 1999::numeric, null, 30, 220::numeric, false, false, 30,        date '2026-10-15', 7, 50),
    ('membresia', 'Membresía ilimitada', 'Todas las clases que quieras. Sin permanencia.',
     'membresia', 2500::numeric, null, 30, 220::numeric, false, false, null::int, null::date, 7, 60)
  ) as x(code, nombre, descripcion, tipo, precio, creditos, vigencia, valor,
         inicia_primera, una_vez, cupo, hasta, dias_antes, orden)
 where b.code = 'PC'
on conflict (bu_id, code) do update set
  nombre = excluded.nombre, descripcion = excluded.descripcion, tipo = excluded.tipo,
  precio = excluded.precio, creditos = excluded.creditos, vigencia_dias = excluded.vigencia_dias,
  valor_visita = excluded.valor_visita, inicia_en_primera_clase = excluded.inicia_en_primera_clase,
  una_vez_por_persona = excluded.una_vez_por_persona, cupo_total = excluded.cupo_total,
  vigente_hasta = excluded.vigente_hasta, reserva_dias_antes = excluded.reserva_dias_antes,
  orden = excluded.orden;

-- La semana de prueba sustituye al descuento de $40 en la suelta: dos ofertas
-- de entrada compitiendo se anulan entre sí, y la de $500 por siete días
-- convierte mucho mejor que $40 en una clase.
update wellness_config cfg set descuento = 0, promo_hasta = null
  from business_units b where b.id = cfg.bu_id and b.code = 'PC';

notify pgrst, 'reload schema';
