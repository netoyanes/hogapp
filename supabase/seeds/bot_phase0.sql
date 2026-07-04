-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Bot AI de reservas — Fase 0 (estructura)
-- Captura en Instagram → confirmación por WhatsApp. Piloto: Bruma MZT (BM).
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
--
-- Principio codificado: cada mensaje del cliente avanza la reserva; nunca se
-- le pide un dato que ya dio ni cambiar de canal sin llevar su contexto.
--
-- Reglas de ritmo (por venue, sin deploy):
-- · Primera respuesta en IG: espera 45s (y junta mensajes que lleguen en esa
--   ventana); siguientes inmediatas (jitter opcional apagado).
-- · Un solo seguimiento a los 5 min si el cliente queda callado, dentro de la
--   ventana de cortesía del venue.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Config del bot por venue+canal ─────────────────────────────────────────
create table if not exists public.bot_venue_config (
  id                        uuid primary key default gen_random_uuid(),
  bu_id                     uuid not null references business_units(id) on delete cascade,
  channel                   text not null check (channel in ('instagram','whatsapp')),
  external_account          text,                       -- IG account id / número WA del holding
  enabled                   boolean not null default false,
  persona_note              text,                       -- ajuste de voz; el brief base sale de business_units
  first_reply_delay_seconds int  not null default 45,
  reply_jitter_seconds      int  not null default 0,    -- perilla "parecer humano" (apagada)
  followup_after_minutes    int  not null default 5,
  followup_window_start     time not null default '11:00',
  followup_window_end       time not null default '23:00',
  max_followups             int  not null default 1,
  timezone                  text not null default 'America/Mazatlan',
  updated_at                timestamptz not null default now(),
  unique (bu_id, channel)
);

-- ─── Conversaciones (existen ANTES de conocer el teléfono — clave en IG) ────
create table if not exists public.bot_conversations (
  id               uuid primary key default gen_random_uuid(),
  channel          text not null check (channel in ('instagram','whatsapp')),
  external_id      text not null,                       -- IGSID (IG) o teléfono E.164 (WA)
  bu_id            uuid references business_units(id),  -- null hasta saber el venue
  guest_id         uuid references guests(id),          -- se liga al capturar/casar el teléfono
  status           text not null default 'bot'
                   check (status in ('bot','needs_human','human','closed')),
  assigned_to      uuid references profiles(id),        -- agente que tomó la conversación
  escalation_reason text,
  last_sender      text check (last_sender in ('guest','bot','agent')),
  pending_fields   text[] not null default '{}',        -- qué falta: name, phone, date, time, pax
  first_seen_at    timestamptz not null default now(),
  last_message_at  timestamptz not null default now(),
  first_replied_at timestamptz,                         -- cuándo salió la 1a respuesta (regla 45s)
  followups_sent   int not null default 0,
  next_followup_at timestamptz,                         -- lo agenda el bot; el cron lo dispara
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (channel, external_id)
);
create index if not exists idx_botconv_status  on bot_conversations (status, last_message_at desc);
create index if not exists idx_botconv_followup on bot_conversations (next_followup_at) where next_followup_at is not null;
create index if not exists idx_botconv_guest   on bot_conversations (guest_id);

-- ─── Mensajes (memoria del bot entre turnos + auditoría) ────────────────────
create table if not exists public.bot_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references bot_conversations(id) on delete cascade,
  role            text not null check (role in ('guest','bot','agent','system')),
  body            text,
  meta            jsonb,                                -- tool calls, template id, ids de plataforma
  created_at      timestamptz not null default now()
);
create index if not exists idx_botmsg_conv on bot_messages (conversation_id, created_at);

-- ─── Canales del cliente (mismo guest en IG + WA sin duplicar) ──────────────
create table if not exists public.guest_channels (
  id          uuid primary key default gen_random_uuid(),
  guest_id    uuid not null references guests(id) on delete cascade,
  channel     text not null check (channel in ('instagram','whatsapp')),
  external_id text not null,                            -- IGSID / handle (el teléfono ya vive en guests)
  handle      text,                                     -- @usuario visible, si aplica
  created_at  timestamptz not null default now(),
  unique (channel, external_id)
);
create index if not exists idx_guestchan_guest on guest_channels (guest_id);

-- ─── Trazabilidad bot ↔ reserva ─────────────────────────────────────────────
alter table public.reservations add column if not exists bot_conversation_id uuid references bot_conversations(id);
alter table public.reservations add column if not exists wa_confirmation_sent_at timestamptz;   -- se mandó la plantilla de confirmación
alter table public.reservations add column if not exists confirmed_via text
  check (confirmed_via in ('whatsapp','host','phone','instagram'));

-- ─── RLS: el bot escribe con service role (Edge Function, salta RLS).
--         El staff LEE lo de sus venues; Marketing sin acceso a mensajes. ────
alter table bot_venue_config  enable row level security;
alter table bot_conversations enable row level security;
alter table bot_messages      enable row level security;
alter table guest_channels    enable row level security;

drop policy if exists botcfg_select on bot_venue_config;
create policy botcfg_select on bot_venue_config for select to authenticated using (true);
drop policy if exists botcfg_write on bot_venue_config;
create policy botcfg_write on bot_venue_config for all to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id));

-- Conversaciones: lectura para staff de operación de ese venue (bu null visible
-- solo a Master/C-Level mientras el bot aún no sabe el venue). Marketing fuera.
drop policy if exists botconv_select on bot_conversations;
create policy botconv_select on bot_conversations for select to authenticated
  using (
    case hog_role()
      when 'MARKETING' then false
      when 'MASTER'    then true
      when 'C_LEVEL'   then true
      else bu_id is not null and hog_has_venue(bu_id)
    end
  );
drop policy if exists botconv_update on bot_conversations;   -- tomar/soltar una conversación
create policy botconv_update on bot_conversations for update to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER','TEAM') and (bu_id is null or hog_has_venue(bu_id)))
  with check (hog_role() in ('MASTER','OPS_MANAGER','TEAM'));

drop policy if exists botmsg_select on bot_messages;
create policy botmsg_select on bot_messages for select to authenticated
  using (
    hog_role() <> 'MARKETING' and exists (
      select 1 from bot_conversations c
      where c.id = conversation_id
        and (hog_role() in ('MASTER','C_LEVEL') or (c.bu_id is not null and hog_has_venue(c.bu_id)))
    )
  );
drop policy if exists botmsg_insert on bot_messages;         -- respuestas de agente humano desde la app
create policy botmsg_insert on bot_messages for insert to authenticated
  with check (role = 'agent' and hog_role() in ('MASTER','OPS_MANAGER','TEAM'));

drop policy if exists guestchan_select on guest_channels;
create policy guestchan_select on guest_channels for select to authenticated
  using (hog_role() <> 'MARKETING');

-- ─── Realtime (bandeja/board del host en vivo) ──────────────────────────────
do $$ begin alter publication supabase_realtime add table bot_conversations; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table bot_messages; exception when duplicate_object then null; end $$;

-- ─── Config global del bot en app_settings ──────────────────────────────────
insert into app_settings (key, value) values
  ('bot_enabled', 'false'),                              -- kill switch global
  ('bot_model', 'claude-haiku-4-5-20251001'),           -- modelo para el chat de reservas
  ('bot_holding_wa_number', '')                          -- número WhatsApp del holding (llénalo)
on conflict (key) do nothing;

-- ─── Seed: config del bot para Bruma MZT (deshabilitado hasta conectar canales) ──
insert into bot_venue_config (bu_id, channel, enabled, persona_note)
select bu.id, ch.channel, false,
       'Bruma MZT — nightlife en Mazatlán. Tono: cercano, con energía nocturna, sin ser exagerado. Trata de tú.'
from business_units bu
cross join (values ('instagram'), ('whatsapp')) as ch(channel)
where bu.code = 'BM'
on conflict (bu_id, channel) do nothing;
