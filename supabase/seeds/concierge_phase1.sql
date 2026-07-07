-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Concierge — Fase 1 (dashboard + simulador)
-- Requiere haber corrido bot_phase0.sql. Idempotente.
--
-- Agrega lo necesario para operar el dashboard antes de conectar Meta:
-- · Columnas de bandeja: nombre visible, tomado cuándo, cerrado cuándo.
-- · Modo simulación: MASTER puede crear conversaciones de prueba para validar
--   el flujo tomar/devolver/cerrar sin canales conectados.
-- · Perilla de escalación por tamaño de grupo (escalate_over_pax).
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Columnas nuevas ─────────────────────────────────────────────────────────
alter table public.bot_conversations add column if not exists display_name text;             -- nombre/handle visible en la bandeja
alter table public.bot_conversations add column if not exists is_simulated boolean not null default false;
alter table public.bot_conversations add column if not exists taken_at  timestamptz;         -- cuándo la tomó un humano
alter table public.bot_conversations add column if not exists closed_at timestamptz;

alter table public.bot_venue_config add column if not exists escalate_over_pax int not null default 12;  -- grupos grandes → humano

-- updated_at automático en conversaciones (touch_updated_at ya existe)
drop trigger if exists trg_botconv_touch on bot_conversations;
create trigger trg_botconv_touch before update on bot_conversations
  for each row execute function touch_updated_at();

-- ─── RLS para el simulador ───────────────────────────────────────────────────
-- MASTER crea/borra conversaciones SIMULADAS desde la app (las reales solo las
-- escribe el bot con service role). is_simulated=true es obligatorio aquí.
drop policy if exists botconv_insert_sim on bot_conversations;
create policy botconv_insert_sim on bot_conversations for insert to authenticated
  with check (hog_role() = 'MASTER' and is_simulated = true);

drop policy if exists botconv_delete_sim on bot_conversations;
create policy botconv_delete_sim on bot_conversations for delete to authenticated
  using (hog_role() = 'MASTER' and is_simulated = true);

-- Mensajes: el staff sigue insertando role='agent' en cualquier conversación
-- suya; en conversaciones SIMULADAS, MASTER puede escribir cualquier rol
-- (guest/bot) para ensayar el ida y vuelta.
drop policy if exists botmsg_insert on bot_messages;
create policy botmsg_insert on bot_messages for insert to authenticated
  with check (
    (role = 'agent' and hog_role() in ('MASTER','OPS_MANAGER','TEAM'))
    or (
      hog_role() = 'MASTER' and exists (
        select 1 from bot_conversations c
        where c.id = conversation_id and c.is_simulated = true
      )
    )
  );
