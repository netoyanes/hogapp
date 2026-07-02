-- Phase 2 — Internal Directory upgrade
-- Run this in the Supabase SQL Editor.

-- Contact classification + finder's-fee owner + soft archive
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS contact_type text DEFAULT 'OTHER';
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS created_by  uuid;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS archived    boolean DEFAULT false;

-- Deal closer — owner of the closing commission
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS closed_by uuid;

-- Helpful index for filtering the directory by type
CREATE INDEX IF NOT EXISTS idx_crm_contacts_type ON public.crm_contacts (contact_type);
