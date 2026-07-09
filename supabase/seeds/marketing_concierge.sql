-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Marketing con acceso completo a Concierge + DJs en Comercial
-- · Marketing ahora opera hospitalidad: lee/toma conversaciones, responde,
--   ve y edita clientes, crea reservas.
-- · El directorio de DJs se consulta desde Comercial: Marketing puede leerlo
--   (el fee se oculta en la UI para Marketing — dato sensible del booker).
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Conversaciones del bot ──────────────────────────────────────────────────
drop policy if exists botconv_select on bot_conversations;
create policy botconv_select on bot_conversations for select to authenticated
  using (
    case hog_role()
      when 'MASTER'  then true
      when 'C_LEVEL' then true
      when 'HEART_OF_HOUSE' then false
      else bu_id is not null and hog_has_venue(bu_id)
    end
  );

drop policy if exists botconv_update on bot_conversations;
create policy botconv_update on bot_conversations for update to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER','TEAM','MARKETING') and (bu_id is null or hog_has_venue(bu_id)))
  with check (hog_role() in ('MASTER','OPS_MANAGER','TEAM','MARKETING'));

drop policy if exists botmsg_select on bot_messages;
create policy botmsg_select on bot_messages for select to authenticated
  using (
    hog_role() <> 'HEART_OF_HOUSE' and exists (
      select 1 from bot_conversations c
      where c.id = conversation_id
        and (hog_role() in ('MASTER','C_LEVEL') or (c.bu_id is not null and hog_has_venue(c.bu_id)))
    )
  );

drop policy if exists botmsg_insert on bot_messages;
create policy botmsg_insert on bot_messages for insert to authenticated
  with check (role = 'agent' and hog_role() in ('MASTER','OPS_MANAGER','TEAM','MARKETING'));

drop policy if exists guestchan_select on guest_channels;
create policy guestchan_select on guest_channels for select to authenticated
  using (hog_role() <> 'HEART_OF_HOUSE');

-- ─── Clientes: Marketing ve y opera el directorio completo de Concierge ─────
drop policy if exists guests_select on guests;
create policy guests_select on guests for select to authenticated
  using (hog_role() <> 'HEART_OF_HOUSE');

drop policy if exists guests_insert on guests;
create policy guests_insert on guests for insert to authenticated
  with check (hog_role() in ('MASTER','OPS_MANAGER','TEAM','MARKETING') and status = 'active');

drop policy if exists guests_update_team on guests;   -- Team/Marketing editan pero NO archivan
create policy guests_update_team on guests for update to authenticated
  using (hog_role() in ('TEAM','MARKETING') and status = 'active')
  with check (status = 'active');

drop policy if exists visits_select on guest_visits;
create policy visits_select on guest_visits for select to authenticated
  using (
    case hog_role()
      when 'HEART_OF_HOUSE' then false
      when 'TEAM'      then hog_has_venue(bu_id)
      when 'MARKETING' then hog_has_venue(bu_id)
      else true
    end
  );

-- ─── Reservas: Marketing también puede crear/editar en sus venues ───────────
drop policy if exists res_insert on reservations;
create policy res_insert on reservations for insert to authenticated
  with check (hog_role() in ('MASTER','OPS_MANAGER','TEAM','MARKETING') and hog_has_venue(bu_id));

drop policy if exists res_update on reservations;
create policy res_update on reservations for update to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER','TEAM','MARKETING') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','OPS_MANAGER','TEAM','MARKETING') and hog_has_venue(bu_id));

-- (La policy de djs que vivía aquí quedó obsoleta: el talento se unificó en
--  crm_contacts con contact_type='DJ' — ver unify_dj_directory.sql.)
