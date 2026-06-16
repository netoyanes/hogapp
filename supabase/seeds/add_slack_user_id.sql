-- Add slack_user_id to profiles
-- Run once in the Supabase SQL editor.
-- Users enter their Slack Member ID in Profile → Slack Integration.
-- Format: U07ABC1234 (found in Slack → click avatar → View Profile → ⋯ More → Copy member ID)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS slack_user_id text;
