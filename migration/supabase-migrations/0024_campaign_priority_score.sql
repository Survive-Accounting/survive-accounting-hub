-- 0024_campaign_priority_score.sql
-- Phase 1 / Part 3: IPEDS-based campaign priority score for campuses.
-- Stored in NEW columns (not the legacy priority_score the app already uses) so
-- nothing existing breaks. campaign_priority_factors records the components for
-- transparency. Weights live in the compute step (see the migration runner /
-- 0024 apply) and are intentionally simple to retune.
--
-- Model (0-100): higher out-of-state tuition, larger enrollment, higher program
-- rigor (masters/PhD in accounting), larger accounting program (Hasselback
-- faculty count at the campus), and SEC membership all raise the score.
-- Targeting + scraping should process highest score first.

alter table public.campuses
  add column if not exists campaign_priority_score   numeric,
  add column if not exists campaign_priority_factors  jsonb;

create index if not exists idx_campuses_campaign_priority
  on public.campuses (campaign_priority_score desc nulls last)
  where archived_at is null;
