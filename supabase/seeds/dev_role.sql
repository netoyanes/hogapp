-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Rol DEV — auditoría de plataforma
-- Ve TODA la app en solo-lectura (dashboard, tareas, comercial, concierge,
-- La Casa, reportes, actividad). Su única escritura real es Tareas: las
-- mejoras se proponen como tareas dentro de la misma app.
-- Sin acceso a: Usuarios (admin), Carga CSV, Config del Concierge (toggles
-- vivos), ni escrituras de operación (las policies existentes ya lo excluyen
-- al listar roles explícitos).
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Rol nuevo en profiles ───────────────────────────────────────────────────
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM','HEART_OF_HOUSE','DEV'));

-- ─── Lectura total donde las policies listan roles explícitos ────────────────

-- Concierge: conversaciones (incluidas las que aún no identifican venue)
drop policy if exists botconv_select on bot_conversations;
create policy botconv_select on bot_conversations for select to authenticated
  using (
    case hog_role()
      when 'MASTER'  then true
      when 'C_LEVEL' then true
      when 'DEV'     then true
      when 'HEART_OF_HOUSE' then false
      else bu_id is not null and hog_has_venue(bu_id)
    end
  );

drop policy if exists botmsg_select on bot_messages;
create policy botmsg_select on bot_messages for select to authenticated
  using (
    hog_role() <> 'HEART_OF_HOUSE' and exists (
      select 1 from bot_conversations c
      where c.id = conversation_id
        and (hog_role() in ('MASTER','C_LEVEL','DEV') or (c.bu_id is not null and hog_has_venue(c.bu_id)))
    )
  );

-- Concierge: FAQ por venue
drop policy if exists vbi_select on venue_bot_info;
create policy vbi_select on venue_bot_info for select to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','DEV'));

-- Talento: agenda de tocadas (lectura para auditar; sin escritura)
drop policy if exists djbook_select on dj_bookings;
create policy djbook_select on dj_bookings for select to authenticated
  using (
    hog_role() in ('MASTER','C_LEVEL','DEV')
    or (hog_role() = 'OPS_MANAGER' and hog_has_venue(bu_id))
    or (hog_has_cap('talento') and hog_has_venue(bu_id))
  );

-- La Casa: lectura completa (checklists, ejecuciones, inventario, incidencias)
drop policy if exists vchk_select on venue_checklists;
create policy vchk_select on venue_checklists for select to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','HEART_OF_HOUSE','DEV') and hog_has_venue(bu_id));

drop policy if exists vchki_select on venue_checklist_items;
create policy vchki_select on venue_checklist_items for select to authenticated
  using (exists (select 1 from venue_checklists c where c.id = checklist_id
                 and hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','HEART_OF_HOUSE','DEV') and hog_has_venue(c.bu_id)));

drop policy if exists crun_select on checklist_runs;
create policy crun_select on checklist_runs for select to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','HEART_OF_HOUSE','DEV') and hog_has_venue(bu_id));

drop policy if exists cruni_select on checklist_run_items;
create policy cruni_select on checklist_run_items for select to authenticated
  using (exists (select 1 from checklist_runs r where r.id = run_id
                 and hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','HEART_OF_HOUSE','DEV') and hog_has_venue(r.bu_id)));

drop policy if exists vassets_select on venue_assets;
create policy vassets_select on venue_assets for select to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','HEART_OF_HOUSE','DEV') and hog_has_venue(bu_id));

drop policy if exists assetev_select on asset_events;
create policy assetev_select on asset_events for select to authenticated
  using (exists (select 1 from venue_assets a where a.id = asset_id
                 and hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','HEART_OF_HOUSE','DEV') and hog_has_venue(a.bu_id)));

drop policy if exists incid_select on ops_incidents;
create policy incid_select on ops_incidents for select to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','HEART_OF_HOUSE','DEV') and hog_has_venue(bu_id));
