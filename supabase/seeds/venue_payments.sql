-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Onboarding de venues — datos de depósito (apartados)
-- Piloto: Bruma MZT. Puente manual (CLABE) en lo que se conecta Stripe.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.venue_payment_config (
  bu_id              uuid primary key references business_units(id) on delete cascade,
  clabe              text,                        -- CLABE interbancaria (18 dígitos)
  bank_name          text,
  beneficiary        text,                        -- a nombre de quién
  deposit_over_pax   int  not null default 8,     -- ofrecer apartado desde N personas
  deposit_per_person numeric,                     -- MXN por persona (o usa monto fijo)
  deposit_fixed      numeric,                     -- MXN monto fijo por reserva
  instructions       text,                        -- nota libre (ej. "mandar comprobante")
  stripe_account_id  text,                        -- listo para cuando se conecte Stripe
  active             boolean not null default false,
  updated_at         timestamptz not null default now()
);

drop trigger if exists trg_venuepay_touch on venue_payment_config;
create trigger trg_venuepay_touch before update on venue_payment_config
  for each row execute function touch_updated_at();

alter table venue_payment_config enable row level security;

-- El staff del venue LEE (para cotejar depósitos); solo MASTER escribe.
drop policy if exists venuepay_select on venue_payment_config;
create policy venuepay_select on venue_payment_config for select to authenticated
  using (hog_role() <> 'MARKETING' and hog_has_venue(bu_id));

drop policy if exists venuepay_write on venue_payment_config;
create policy venuepay_write on venue_payment_config for all to authenticated
  using (hog_role() = 'MASTER')
  with check (hog_role() = 'MASTER');

-- Seed: fila vacía para Bruma MZT (se llena desde Concierge → Configuración)
insert into venue_payment_config (bu_id)
select id from business_units where code = 'BM'
on conflict (bu_id) do nothing;
