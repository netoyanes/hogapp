-- Phase 6 — CRM → Calendar link (events)
-- Run this in the Supabase SQL Editor.

-- Dedicated event date so EVENT deals can appear on the Calendar
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS event_date date;

CREATE INDEX IF NOT EXISTS idx_crm_deals_event_date ON public.crm_deals (event_date);
