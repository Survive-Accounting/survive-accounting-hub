-- Instagram DM queue — the endpoint of the scrape→review→submit flow.
--
-- When a campus's contacts are reviewed and submitted, we stamp it here: one row per campus,
-- marking it "queued for Instagram outreach". The (future) /coldoutreach/instagram page reads
-- this to list campuses ready to DM. Contacts themselves live in growth_contact_qc (the canonical
-- store the enrichment view + board already read), so nothing new is needed to hold them.
--
-- chapter_affiliation: the scraper grabs the member's Greek chapter when a council page lists it
-- (e.g. an IFC officer who is a Sigma Chi). Opportunistic — never searched for, blank when absent.
-- It rides on growth_contact_qc so it shows next to the contact.

begin;

create table if not exists public.growth_ig_queue (
  campus_id      uuid primary key references public.campuses(id) on delete cascade,
  queued_at      timestamptz not null default now(),
  queued_by      text,
  contact_count  int not null default 0,
  sent_at        timestamptz,
  replied_at     timestamptz,
  notes          text
);

comment on table public.growth_ig_queue is 'Campuses submitted for Instagram DM outreach (scrape→review→submit endpoint).';

alter table public.growth_contact_qc
  add column if not exists chapter_affiliation text;

comment on column public.growth_contact_qc.chapter_affiliation is 'Greek chapter a council officer belongs to, when the source lists it. Opportunistic, never searched.';

commit;
