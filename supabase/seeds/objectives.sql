-- Phase 4 — Quarterly Objectives (OKRs)
-- Run this in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.objectives (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text,
  level         text NOT NULL DEFAULT 'INDIVIDUAL',  -- COMPANY | MANAGER | INDIVIDUAL
  owner_id      uuid,                                 -- whom it belongs to (null = company-wide)
  created_by    uuid,
  year          int  NOT NULL,
  quarter       int  NOT NULL,                        -- 1-4
  target_value  numeric NOT NULL DEFAULT 100,
  current_value numeric NOT NULL DEFAULT 0,
  unit          text,                                 -- e.g. deals, $, %, posts
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Monthly breakdown of a quarterly objective
CREATE TABLE IF NOT EXISTS public.objective_months (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id  uuid REFERENCES public.objectives(id) ON DELETE CASCADE,
  month         int NOT NULL,                         -- 1-12
  target_value  numeric DEFAULT 0,
  current_value numeric DEFAULT 0,
  UNIQUE (objective_id, month)
);

-- Self-evaluations
CREATE TABLE IF NOT EXISTS public.self_evaluations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id uuid REFERENCES public.objectives(id) ON DELETE CASCADE,
  user_id      uuid,
  score        int,                                   -- 1-5
  note         text,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_objectives_period ON public.objectives (year, quarter);
CREATE INDEX IF NOT EXISTS idx_objective_months  ON public.objective_months (objective_id);
CREATE INDEX IF NOT EXISTS idx_self_evals_obj    ON public.self_evaluations (objective_id);

ALTER TABLE public.objectives       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objective_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS objectives_all       ON public.objectives;
DROP POLICY IF EXISTS objective_months_all ON public.objective_months;
DROP POLICY IF EXISTS self_evals_all       ON public.self_evaluations;

CREATE POLICY objectives_all       ON public.objectives       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY objective_months_all ON public.objective_months FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY self_evals_all       ON public.self_evaluations FOR ALL TO authenticated USING (true) WITH CHECK (true);
