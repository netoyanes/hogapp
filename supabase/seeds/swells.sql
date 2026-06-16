-- Swells — Business Units seed
-- Run this in the Supabase SQL editor after creating the new project.

insert into public.business_units (code, name) values
  ('DUNA', 'La Duna'),
  ('EPA',  'EPA')
on conflict do nothing;
