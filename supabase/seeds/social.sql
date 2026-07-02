-- Phase 3 — Social area
-- Run this in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.social_posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  uuid,
  kind       text NOT NULL,        -- LINK | YOUTUBE | INSTAGRAM | TIKTOK | PDF | IMAGE | HTML
  url        text,
  caption    text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id    uuid,
  emoji      text NOT NULL,        -- 👍 | ❤️ | 🔥
  created_at timestamptz DEFAULT now(),
  UNIQUE (post_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_social_posts_created   ON public.social_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_reactions_post  ON public.social_reactions (post_id);

-- Open RLS (app-level gating). Enable + permissive policies.
ALTER TABLE public.social_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_posts_all     ON public.social_posts;
DROP POLICY IF EXISTS social_reactions_all ON public.social_reactions;

CREATE POLICY social_posts_all     ON public.social_posts     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY social_reactions_all ON public.social_reactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
