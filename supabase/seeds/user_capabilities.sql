-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Funciones por usuario (capabilities)
-- El rol define el acceso base; las funciones LIBERAN áreas específicas para
-- personas puntuales sin inflar el rol de todo su equipo. Caso fundador: el
-- booker vive en Marketing pero necesita Talento (DJs y fees).
-- Las asigna MASTER desde Usuarios. Catálogo extensible (hoy: 'talento').
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.user_capabilities (
  user_id     uuid not null references profiles(id) on delete cascade,
  capability  text not null check (capability in ('talento')),
  granted_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (user_id, capability)
);

-- ¿El usuario actual tiene la función? (para usar dentro de policies)
create or replace function public.hog_has_cap(cap text) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from user_capabilities where user_id = auth.uid() and capability = cap) $$;

alter table user_capabilities enable row level security;

drop policy if exists ucap_select on user_capabilities;
create policy ucap_select on user_capabilities for select to authenticated
  using (user_id = auth.uid() or hog_role() = 'MASTER');

drop policy if exists ucap_write on user_capabilities;
create policy ucap_write on user_capabilities for all to authenticated
  using (hog_role() = 'MASTER') with check (hog_role() = 'MASTER');

-- ─── Función 'talento': abre dj_bookings (los fees por tocada) ───────────────
-- El directorio de DJs (crm_contacts) ya es legible para Marketing; lo que
-- esta función libera es la agenda de tocadas con su fee negociado.
drop policy if exists djbook_select on dj_bookings;
create policy djbook_select on dj_bookings for select to authenticated
  using (
    hog_role() in ('MASTER','C_LEVEL')
    or (hog_role() = 'OPS_MANAGER' and hog_has_venue(bu_id))
    or (hog_has_cap('talento') and hog_has_venue(bu_id))
  );

drop policy if exists djbook_write on dj_bookings;
create policy djbook_write on dj_bookings for all to authenticated
  using (
    hog_role() = 'MASTER'
    or (hog_role() = 'OPS_MANAGER' and hog_has_venue(bu_id))
    or (hog_has_cap('talento') and hog_has_venue(bu_id))
  )
  with check (
    hog_role() = 'MASTER'
    or (hog_role() = 'OPS_MANAGER' and hog_has_venue(bu_id))
    or (hog_has_cap('talento') and hog_has_venue(bu_id))
  );
