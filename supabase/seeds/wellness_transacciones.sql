-- ═════════════════════════════════════════════════════════════════════════════
-- WELLNESS · VISTA DE TRANSACCIONES
--
-- El Tablero se alimenta de los CIERRES DE TURNO, que alguien captura al final
-- de cada clase. Eso sirve para operación, pero deja fuera todo el dinero que
-- entra sin pasar por un cierre: un pago en línea, un paquete comprado desde el
-- portal. Por eso un cobro con tarjeta era invisible en el tablero.
--
-- Esta vista es la otra mitad: el movimiento de dinero, venga de donde venga.
-- Son tres orígenes y NO se traslapan:
--
--   · pago en línea   wellness_payments (Blumon), con su referencia
--   · compra          wellness_purchases — paquete, membresía o prueba
--   · clase suelta    wellness_bookings pagadas que NO salieron de una compra
--                     ni de un pago en línea, o sea: cobradas en caja
--
-- El traslape se evita por construcción: una reserva cubierta por un paquete
-- trae purchase_id (el dinero ya se contó en la compra) y una pagada en línea
-- trae payment_id (ya se contó en el pago). La tercera rama excluye ambas.
--
-- security_invoker: la vista respeta el RLS de quien consulta, en vez de correr
-- con los permisos de quien la creó.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Requiere wellness.sql, wellness_ticket.sql y wellness_productos.sql.
-- ═════════════════════════════════════════════════════════════════════════════

create or replace view public.v_wellness_transacciones
with (security_invoker = true) as

-- ── Pagos en línea ──────────────────────────────────────────────────────────
select
  p.id,
  coalesce(p.paid_at, p.created_at)          as fecha,
  'linea'::text                              as via,
  p.status                                   as estado,
  p.amount                                   as monto,
  s.full_name                                as alumno,
  s.phone                                    as telefono,
  coalesce(c.name || ' · ' || to_char(b.class_date, 'DD Mon'), 'Clase') as concepto,
  b.code                                     as codigo,
  p.blumon_reference                         as referencia,
  bu.code                                    as venue
from wellness_payments p
join wellness_students s on s.id = p.student_id
left join wellness_bookings b on b.id = p.booking_id
left join wellness_slots sl on sl.id = b.slot_id
left join wellness_classes c on c.id = sl.class_id
left join business_units bu on bu.id = c.bu_id

union all

-- ── Compras de paquete, membresía o semana de prueba ────────────────────────
select
  pu.id,
  coalesce(pu.paid_at, pu.created_at),
  coalesce(pu.paid_via, 'caja'),
  case when pu.paid then 'pagado' else 'pendiente' end,
  pu.precio,
  s.full_name,
  s.phone,
  pr.nombre,
  pu.code,
  null,
  bu.code
from wellness_purchases pu
join wellness_students s on s.id = pu.student_id
join wellness_products pr on pr.id = pu.product_id
join business_units bu on bu.id = pr.bu_id
where pu.status <> 'cancelada'

union all

-- ── Clases sueltas cobradas en caja ─────────────────────────────────────────
-- Sin paid_at en wellness_bookings, la fecha más cercana al movimiento es la de
-- la reserva. Es una aproximación, y está dicho aquí para que nadie la lea como
-- hora exacta de caja.
select
  b.id,
  b.created_at,
  coalesce(b.paid_via, 'caja'),
  'pagado',
  b.amount,
  s.full_name,
  s.phone,
  c.name || ' · ' || to_char(b.class_date, 'DD Mon'),
  b.code,
  null,
  bu.code
from wellness_bookings b
join wellness_students s on s.id = b.student_id
join wellness_slots sl on sl.id = b.slot_id
join wellness_classes c on c.id = sl.class_id
join business_units bu on bu.id = c.bu_id
where b.paid
  and b.purchase_id is null
  and b.payment_id is null
  and coalesce(b.amount, 0) > 0;

comment on view public.v_wellness_transacciones is
  'Todo el dinero de wellness: pagos en línea, compras de paquetes y clases sueltas de caja. Sin traslape.';

grant select on public.v_wellness_transacciones to authenticated;

notify pgrst, 'reload schema';
