-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · CORTE POST-EVENTO — ingreso, gasto y utilidad
--
-- Hasta ahora el corte medía el presupuesto contra lo realmente gastado por
-- partida. Eso responde "¿me pasé?", pero no responde la pregunta que importa
-- al cerrar un evento: "¿ganamos, y cuánto?".
--
-- Estas dos columnas capturan el resultado REAL de la noche —lo que entró y lo
-- que salió, completo— y de ahí sale la utilidad y el margen. Se llevan a nivel
-- de plan y no por partida a propósito: al cerrar un evento nadie tiene el
-- desglose fino, pero sí tiene los dos totales, y con eso ya se puede decidir
-- si el evento se repite.
--
-- Se nombran igual que actual_attendance (mismo momento, misma lógica).
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

alter table event_plans add column if not exists actual_revenue numeric(12,2)
  check (actual_revenue is null or actual_revenue >= 0);
alter table event_plans add column if not exists actual_cost    numeric(12,2)
  check (actual_cost    is null or actual_cost    >= 0);

comment on column event_plans.actual_revenue is 'Ingreso total real del evento (corte post-evento)';
comment on column event_plans.actual_cost    is 'Gasto total real del evento (corte post-evento)';

-- Vista del resultado por proyecto: utilidad, margen y por-persona.
-- Es vista y no columnas calculadas para que la fórmula viva en UN solo lugar
-- —si mañana el margen se calcula distinto, se cambia aquí y no en cada pantalla.
create or replace view public.v_project_resultado as
select
  p.id, p.name, p.bu_id, p.kind, p.event_type, p.status,
  p.date, p.end_date,
  p.expected_attendance, p.actual_attendance,
  p.actual_revenue, p.actual_cost,
  (p.actual_revenue - p.actual_cost) as utilidad,
  case when coalesce(p.actual_revenue, 0) > 0
       then round(((p.actual_revenue - p.actual_cost) / p.actual_revenue) * 100, 1)
  end as margen_pct,
  case when coalesce(p.actual_attendance, 0) > 0
       then round(p.actual_revenue / p.actual_attendance, 2)
  end as ingreso_por_persona,
  case when coalesce(p.actual_attendance, 0) > 0
       then round((p.actual_revenue - p.actual_cost) / p.actual_attendance, 2)
  end as utilidad_por_persona
from event_plans p
where p.actual_revenue is not null or p.actual_cost is not null;

grant select on public.v_project_resultado to authenticated;
