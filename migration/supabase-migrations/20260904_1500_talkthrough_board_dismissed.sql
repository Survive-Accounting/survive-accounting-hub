-- 20260904_1500 — CLEAR OLD RESULTS: board items can be DISMISSED.
--
-- Additive only. "Clear old results" in the talkthrough booth takes the last
-- pass's cards (script · CEQ edits · ideas · vibe plan) off the Step 2 Review
-- board before Lee talks a new pass. It is a SOFT hide, not a delete and not
-- an archive: the row, its payload and its verbatim quote all stay, so
-- anything already built from a card (a slide's bank_item_id on the film
-- draft, a film pick, a banked idea) still resolves.
--
-- Until this runs the client still works: the server strips `dismissed`,
-- retries once, and returns a WARNING that the studio's sync chip and the
-- button itself show in red — dismissal is local-only, and it says so.

begin;

alter table public.talkthrough_board_items
  add column if not exists dismissed boolean not null default false;

comment on column public.talkthrough_board_items.dismissed is
  'Cleared off the Review board before a new pass (2026-09-04). Soft hide — the row, payload and quote stay; false/absent = live on the board.';

commit;

-- PROOF (must return one row: dismissed · boolean · NO · false):
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'talkthrough_board_items'
  and column_name = 'dismissed';
