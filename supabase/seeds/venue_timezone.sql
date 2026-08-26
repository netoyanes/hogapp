-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · ZONA HORARIA POR VENUE
--
-- El holding opera en DOS husos: Mazatlán (UTC-7) y Ciudad de México (UTC-6).
-- Hasta ahora todo lo que dependía de "hoy" o de "ahora" se calculaba con el
-- reloj de QUIEN MIRA, no del venue. Consecuencias reales:
--
--   · Alguien en Sinaloa abriendo el link de un venue de CDMX ve los horarios
--     de hoy corridos una hora — y a las 23:00 de Mazatlán ya es "mañana" en
--     CDMX, así que la fecha preseleccionada es el día equivocado.
--   · Un huésped en España o California ve el formulario en SU día, no en el
--     de la casa. Ahí el desfase es de horas, no de una.
--
-- La hora del venue es la única que importa: la mesa se sirve en el venue.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

alter table business_units add column if not exists timezone text not null
  default 'America/Mazatlan';

comment on column business_units.timezone is
  'Zona horaria IANA del venue. Todo cálculo de "hoy"/"ahora" usa ESTA, no la del visitante.';

-- Se valida contra el catálogo real de husos: un typo aquí desplaza reservas
-- en silencio, que es de los errores más caros y más difíciles de ver.
--
-- Va por TRIGGER y no por CHECK porque Postgres no admite subconsultas en un
-- check, y sin validación un 'America/Marte' se guarda tan campante y luego
-- hace reventar el formulario de reservas al calcular la hora del venue.
create or replace function public.fn_tz_valida(p_tz text)
returns boolean language sql stable as $$
  select exists (select 1 from pg_timezone_names where name = p_tz)
$$;

create or replace function public.business_units_valida_tz() returns trigger
language plpgsql as $$
begin
  if new.timezone is null or not fn_tz_valida(new.timezone) then
    raise exception 'Zona horaria inválida: "%". Usa un nombre IANA real, por ejemplo America/Mazatlan o America/Mexico_City.', new.timezone;
  end if;
  return new;
end $$;

drop trigger if exists trg_bu_tz on business_units;
create trigger trg_bu_tz before insert or update of timezone on business_units
  for each row execute function business_units_valida_tz();

-- ─── Asignación EXPLÍCITA por código ────────────────────────────────────────
-- Se asigna por código y no adivinando por el nombre. Adivinar falla justo
-- donde más duele: "Oyster CLUB" no dice en su nombre que está en la Condesa,
-- así que una detección por texto lo habría dejado en Mazatlán —una hora
-- corrida— y es el venue con más reservas por web.
--
-- Solo se tocan los venues de los que hay certeza. El resto queda en el
-- default y sale marcado en la verificación de abajo para que lo revises.
update business_units set timezone = 'America/Mexico_City'
 where code in (
   'OC',   -- Oyster CLUB · rooftop del Hotel Flow Condesa, Condesa Hipódromo
   'PC',   -- POD Condesa
   'AR'    -- Apricot ROMA
 );

update business_units set timezone = 'America/Mazatlan'
 where code in (
   'AM',   -- Apricot MZT
   'BM',   -- Bruma MZT
   'PM'    -- POD Mazatlan
 );

-- ─── Helpers: "hoy" y "ahora" EN EL VENUE ───────────────────────────────────
-- Los helpers DEGRADAN en vez de reventar: si un venue quedó con un huso
-- inválido (dato viejo, carga manual), la reserva se sigue pudiendo hacer con
-- la hora de Mazatlán en vez de tirar el formulario público entero.
create or replace function public.fn_venue_tz(p_bu uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when fn_tz_valida(b.timezone) then b.timezone else 'America/Mazatlan' end
    from business_units b where b.id = p_bu
$$;

create or replace function public.fn_venue_hoy(p_bu uuid)
returns date language sql stable security definer set search_path = public as $$
  select (timezone(coalesce(fn_venue_tz(p_bu), 'America/Mazatlan'), now()))::date
$$;

create or replace function public.fn_venue_ahora(p_bu uuid)
returns timestamp language sql stable security definer set search_path = public as $$
  select timezone(coalesce(fn_venue_tz(p_bu), 'America/Mazatlan'), now())
$$;

grant execute on function public.fn_venue_tz(uuid)    to anon, authenticated;
grant execute on function public.fn_venue_hoy(uuid)   to anon, authenticated;
grant execute on function public.fn_venue_ahora(uuid) to anon, authenticated;

-- ─── Verificación ───────────────────────────────────────────────────────────
-- La columna "revisar" marca los venues que NADIE asignó a mano y quedaron en
-- el default. Para cada uno de esos, confirma su ciudad y corrígelo:
--
--   update business_units set timezone = 'America/Mexico_City' where code = 'XX';
--
-- Un huso equivocado no se ve: simplemente las reservas salen una hora
-- corridas y nadie sabe por qué.
select code, name, timezone,
       to_char(timezone(timezone, now()), 'HH24:MI') as hora_alla_ahora,
       case when code in ('OC','PC','AR','AM','BM','PM') then ''
            else '← REVISAR: quedó en el default' end as revisar
  from business_units
 order by revisar desc, timezone, code;
