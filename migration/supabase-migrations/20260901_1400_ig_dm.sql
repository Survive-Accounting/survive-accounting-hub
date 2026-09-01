-- Instagram DM board state — the operating layer of /admin/growth/coldoutreach.
--
-- One row per council contact we DM. Tracks whether the DM was sent, whether they replied, and the
-- back-and-forth thread (our DM → their reply → our follow-up → …). Clicks and chapter-share opens
-- are NOT stored here — they already live in contact_ref_visit, keyed by the same growth_contact_qc
-- id we put in the DM's ?ref= link. Signups-per-contact stay unwired for now (Lee's call).

begin;

create table if not exists public.growth_ig_dm (
  id            uuid primary key default gen_random_uuid(),
  contact_qc_id uuid not null references public.growth_contact_qc(id) on delete cascade,
  campus_id     uuid references public.campuses(id) on delete cascade,
  council_type  text,
  sent_at       timestamptz,
  sent_by       text,
  replied_at    timestamptz,
  -- [{ who: 'us' | 'them', text: string, at: iso-timestamp }]
  thread        jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (contact_qc_id)
);

comment on table public.growth_ig_dm is 'Per-contact Instagram DM state (sent/replied/thread) for the cold-outreach DM board.';

create index if not exists growth_ig_dm_campus_idx on public.growth_ig_dm (campus_id);

commit;
