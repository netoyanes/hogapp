-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · Concierge — atribución de campañas (mensajes que llegan de anuncios)
-- Meta manda un bloque `referral` cuando el cliente escribe desde un anuncio
-- (click-to-message de IG/FB o CTWA de WhatsApp). Se guarda en la conversación
-- para que el bot abra vendiendo ESE evento/promo y para medir reservas por
-- campaña después.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

alter table bot_conversations add column if not exists referral jsonb;
