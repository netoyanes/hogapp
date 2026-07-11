-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · LA CASA — observación por punto de checklist (feedback sobre foto)
-- El supervisor deja una observación puntual sobre un item/foto al revisar la
-- puesta a punto; el HoH la ve marcada en ese punto (💬).
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

alter table checklist_run_items add column if not exists review_note text;
