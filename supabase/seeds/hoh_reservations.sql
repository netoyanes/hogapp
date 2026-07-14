-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Heart of House — acceso a Reservas (tablet de host en el venue)
-- HoH pasa a gestionar la agenda de reservas de sus venues: leer, crear y
-- editar reservas, y leer/crear clientes (indispensable para reservar).
-- NO abre Bandeja, mensajes del bot, DJs ni Config — solo la agenda.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Reservas: crear y editar en sus venues asignados ───────────────────────
drop policy if exists res_insert on reservations;
create policy res_insert on reservations for insert to authenticated
  with check (hog_role() in ('MASTER','OPS_MANAGER','TEAM','MARKETING','HEART_OF_HOUSE') and hog_has_venue(bu_id));

drop policy if exists res_update on reservations;
create policy res_update on reservations for update to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER','TEAM','MARKETING','HEART_OF_HOUSE') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','OPS_MANAGER','TEAM','MARKETING','HEART_OF_HOUSE') and hog_has_venue(bu_id));

-- res_select ya cubre HoH: cae en el else → hog_has_venue(bu_id).

-- ─── Clientes: HoH lee el directorio y da de alta (para poder reservar) ─────
-- (Antes guests_select excluía a HoH; ahora lo incluye. Los detalles de
--  visitas cross-venue siguen restringidos por su propia policy.)
drop policy if exists guests_select on guests;
create policy guests_select on guests for select to authenticated
  using (true);

drop policy if exists guests_insert on guests;
create policy guests_insert on guests for insert to authenticated
  with check (hog_role() in ('MASTER','OPS_MANAGER','TEAM','MARKETING','HEART_OF_HOUSE') and status = 'active');

drop policy if exists guestchan_select on guest_channels;
create policy guestchan_select on guest_channels for select to authenticated
  using (true);
