-- ─────────────────────────────────────────────────────────────────────────────
-- PROPUESTA FORMAL EN EL CRM
--
-- Un deal no puede pasar a "Propuesta" nomás de dicho: la etapa afirma que ya
-- se le propuso algo concreto al cliente. Desde ahora la app exige, para entrar
-- a esa etapa, un MONTO y el PDF de la propuesta — y aquí queda quién lo subió
-- y cuándo, para poder auditar qué se le prometió a quién.
-- El PDF vive en el bucket 'proofs' bajo propuestas/<deal_id>/.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
alter table crm_deals add column if not exists proposal_url         text;
alter table crm_deals add column if not exists proposal_type        text;
alter table crm_deals add column if not exists proposal_uploaded_by uuid references profiles(id) on delete set null;
alter table crm_deals add column if not exists proposal_uploaded_at timestamptz;

notify pgrst, 'reload schema';
