
-- 1. Cache discovered prefixes on campus.
ALTER TABLE public.campuses
  ADD COLUMN IF NOT EXISTS discovered_course_prefixes JSONB;

-- 2. Batch job header.
CREATE TABLE IF NOT EXISTS public.campus_research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'running', -- running | paused | done | canceled
  total_count INTEGER NOT NULL DEFAULT 0,
  done_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campus_research_jobs TO anon, authenticated;
GRANT ALL ON public.campus_research_jobs TO service_role;
ALTER TABLE public.campus_research_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon all crj" ON public.campus_research_jobs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth all crj" ON public.campus_research_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Per-campus item.
CREATE TABLE IF NOT EXISTS public.campus_research_job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.campus_research_jobs(id) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | failed | skipped
  current_step TEXT,                        -- profile | leads | prefixes | sections | null
  profile_done BOOLEAN NOT NULL DEFAULT false,
  leads_count INTEGER NOT NULL DEFAULT 0,
  sections_count INTEGER NOT NULL DEFAULT 0,
  families_with_zero TEXT[] NOT NULL DEFAULT '{}'::text[],
  retries INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  failed_step TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, campus_id)
);

CREATE INDEX IF NOT EXISTS crji_job_status_idx
  ON public.campus_research_job_items (job_id, status);
CREATE INDEX IF NOT EXISTS crji_pending_idx
  ON public.campus_research_job_items (status)
  WHERE status IN ('pending', 'running');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campus_research_job_items TO anon, authenticated;
GRANT ALL ON public.campus_research_job_items TO service_role;
ALTER TABLE public.campus_research_job_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon all crji" ON public.campus_research_job_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth all crji" ON public.campus_research_job_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. updated_at triggers
CREATE TRIGGER set_crj_updated_at BEFORE UPDATE ON public.campus_research_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_crji_updated_at BEFORE UPDATE ON public.campus_research_job_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
