-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Directorio unificado — los DJs viven en crm_contacts
-- Un DJ es un contacto del directorio general con contact_type = 'DJ' y campos
-- extra de talento (géneros, fee, rider, rating…). Las tocadas (dj_bookings)
-- apuntan al contacto. La tabla djs se migra (conservando ids) y se elimina.
-- OJO: junto con este SQL hay que re-desplegar concierge-agent (el bot lee el
-- talento de crm_contacts a partir de este cambio).
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Campos de talento en el directorio general (null para no-DJs) ───────────
alter table crm_contacts add column if not exists real_name text;
alter table crm_contacts add column if not exists instagram text;
alter table crm_contacts add column if not exists city text;
alter table crm_contacts add column if not exists genres text[] not null default '{}';
alter table crm_contacts add column if not exists base_fee numeric;
alter table crm_contacts add column if not exists fee_notes text;
alter table crm_contacts add column if not exists rider text;
alter table crm_contacts add column if not exists links text;
alter table crm_contacts add column if not exists rating int check (rating between 1 and 5);
alter table crm_contacts add column if not exists vetoed boolean not null default false;
alter table crm_contacts add column if not exists source text not null default 'manual'
  check (source in ('manual','concierge'));

-- ─── Migración: djs → crm_contacts conservando ids (las tocadas no se tocan) ─
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'djs') then

    insert into crm_contacts
      (id, full_name, real_name, phone, email, instagram, city, genres,
       base_fee, fee_notes, rider, links, rating, vetoed, source,
       contact_type, created_by, created_at)
    select
      id, stage_name, real_name, phone, email, instagram, city, genres,
      base_fee, fee_notes, rider, links, rating, (status = 'vetoed'), source,
      'DJ', created_by, created_at
    from djs
    on conflict (id) do nothing;

    -- Las tocadas apuntan ahora al contacto (mismos uuid → cero pérdida)
    alter table dj_bookings drop constraint if exists dj_bookings_dj_id_fkey;
    alter table dj_bookings add constraint dj_bookings_dj_id_fkey
      foreign key (dj_id) references crm_contacts(id) on delete cascade;

    drop table djs;
  end if;
end $$;

create index if not exists idx_crm_contacts_dj on crm_contacts (contact_type) where contact_type = 'DJ';
