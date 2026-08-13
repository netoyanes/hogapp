-- ─────────────────────────────────────────────────────────────────────────────
-- Reclutamiento (bolsa de trabajo, solo Master) + confirmación automática de
-- reservas por WhatsApp. Idempotente: se puede correr las veces que sea.
-- ─────────────────────────────────────────────────────────────────────────────

-- Bolsa de trabajo: candidatos que el Concierge registra cuando alguien
-- escribe buscando empleo (registrar_candidato), o dados de alta a mano.
create table if not exists job_candidates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  bu_id uuid references business_units(id) on delete set null,
  conversation_id uuid references bot_conversations(id) on delete set null,
  source text not null default 'concierge',              -- concierge | manual
  channel text,                                          -- whatsapp | instagram
  full_name text not null,
  phone text,
  ig_handle text,
  area text,                                             -- puesto/área de interés
  experience text,
  city text,
  links text,
  notes text,
  status text not null default 'nuevo'
    check (status in ('nuevo','contactado','entrevista','contratado','descartado'))
);

alter table job_candidates enable row level security;

-- Solo el Master ve y administra la bolsa (el edge function escribe con
-- service role, que brinca RLS).
drop policy if exists job_candidates_master on job_candidates;
create policy job_candidates_master on job_candidates for all
  using (hog_role() = 'MASTER') with check (hog_role() = 'MASTER');

-- Confirmación automática por WhatsApp: dedup — una reserva recibe UNA sola
-- confirmación automática (reservation-notify la marca aquí).
alter table reservations add column if not exists confirm_sent_at timestamptz;

-- Nombre de la plantilla aprobada en Meta (WhatsApp Manager). Cambiar el valor
-- si la plantilla se registra con otro nombre.
insert into app_settings (key, value) values ('wa_confirm_template', 'confirmacion_reserva')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
