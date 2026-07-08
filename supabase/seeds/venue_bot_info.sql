-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · venue_bot_info — información por venue para el Concierge (FAQ)
-- Una fila por venue. El FAQ se guarda desde Config y el bot lo usará a partir
-- del deploy de la fase FAQ (viernes).
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.venue_bot_info (
  bu_id       uuid primary key references business_units(id) on delete cascade,
  faq         text,                 -- preguntas frecuentes en texto libre (Q/A por líneas)
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_venue_bot_info_touch on venue_bot_info;
create trigger trg_venue_bot_info_touch before update on venue_bot_info
  for each row execute function touch_updated_at();

-- ─── RLS: lectura para roles con acceso a hospitality; escritura Ops/Master.
--         El bot lee con service role. ──────────────────────────────────────
alter table venue_bot_info enable row level security;

drop policy if exists vbi_select on venue_bot_info;
create policy vbi_select on venue_bot_info for select to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER'));

drop policy if exists vbi_write on venue_bot_info;
create policy vbi_write on venue_bot_info for all to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER'))
  with check (hog_role() in ('MASTER','OPS_MANAGER'));
