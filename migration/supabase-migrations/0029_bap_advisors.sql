-- 0029_bap_advisors.sql
-- Beta Alpha Psi (BAP) faculty-advisor enrichment. Idempotent — safe to re-run.
--
-- Adds chapter tracking to campuses and BAP-advisor flags to outreach_leads so
-- these leads are a measurable, separable segment (professors vs BAP vs Greek).
-- Numbered 0029: next after the pricing-page branch's 0028 (main's high-water
-- mark was 0027 at branch time). Renumber on merge if anything else lands first.

alter table public.campuses
  add column if not exists has_bap_chapter boolean,
  add column if not exists bap_chapter_designation text,   -- e.g. "Theta Chi chapter"
  add column if not exists bap_checked_at timestamptz;

alter table public.outreach_leads
  add column if not exists is_bap_advisor boolean default false,
  add column if not exists bap_advisor_title text,          -- e.g. "Faculty Advisor"
  add column if not exists email_is_generic boolean default false;  -- chapter inbox, not a person

create index if not exists outreach_leads_is_bap_advisor_idx
  on public.outreach_leads (is_bap_advisor) where is_bap_advisor;
create index if not exists campuses_has_bap_chapter_idx
  on public.campuses (has_bap_chapter);
