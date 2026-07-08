-- 0053_reddit_triage_enhancements — richer Reddit mention triage.
--   • starred (priority), is_accounting_major, taking_course/taking_term (loose
--     schedule signal), sent_via (which channels Lee used: dm/comment)
--   • status set changes to open|sent|engaged|ignored (migrate new/reviewed→open)
--   author already stores the reddit username. Idempotent. After 0052.
alter table public.reddit_mentions
  add column if not exists starred              boolean not null default false,
  add column if not exists is_accounting_major  boolean,
  add column if not exists taking_course        text,     -- family key: intro_1|intro_2|intermediate_1|intermediate_2
  add column if not exists taking_term          text,     -- free text, e.g. "Fall 2025"
  add column if not exists sent_via             text[] not null default '{}';  -- dm | comment

update public.reddit_mentions set status = 'open' where status in ('new', 'reviewed');
alter table public.reddit_mentions alter column status set default 'open';

create index if not exists reddit_mentions_starred_idx on public.reddit_mentions (starred) where starred;

notify pgrst, 'reload schema';
