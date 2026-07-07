-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Concierge — Fase 2 (conexión real a Meta: WhatsApp + Instagram)
-- Requiere haber corrido bot_phase0.sql y concierge_phase1.sql. Idempotente.
--
-- Agrega el reloj de respuesta del bot (batching de 45s + seguimiento de 5 min)
-- y el cron que despacha esos turnos llamando a la Edge Function del agente.
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.bot_conversations add column if not exists next_bot_reply_at timestamptz;

-- URL pública de la app (para el link al aviso de privacidad que el bot
-- comparte al pedir el teléfono). Vacío por default — llénalo con tu dominio
-- de producción (ej. https://hogapp.tuapp.com, sin slash final) para que el
-- bot mande el link; si lo dejas vacío, el bot simplemente no lo menciona.
insert into app_settings (key, value) values ('app_public_url', '')
on conflict (key) do nothing;

create index if not exists idx_botconv_next_reply on bot_conversations (next_bot_reply_at) where next_bot_reply_at is not null;

-- ─── Cron: despacha turnos pendientes cada minuto ───────────────────────────
-- pg_cron tiene granularidad de minuto; el margen real sobre los 45s/5min
-- configurados es de hasta ~60s adicionales por el ciclo del cron — aceptable
-- para un piloto de hospitalidad, no para trading de alta frecuencia.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- IMPORTANTE: reemplaza los DOS placeholders de abajo con tu Project URL y tu
-- service_role_key reales (Supabase → Project Settings → API) ANTES de correr
-- este bloque. En Supabase hosted no se puede usar `alter database ... set`
-- (no eres superusuario), así que los valores van directo aquí — es el patrón
-- que la propia doc de Supabase usa. La llave queda guardada en la tabla
-- cron.job, visible solo para roles privilegiados (nunca anon/authenticated).
select cron.unschedule('concierge-dispatch') where exists (select 1 from cron.job where jobname = 'concierge-dispatch');

select cron.schedule(
  'concierge-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://TU-REF.supabase.co/functions/v1/concierge-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer TU-SERVICE-ROLE-KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);
