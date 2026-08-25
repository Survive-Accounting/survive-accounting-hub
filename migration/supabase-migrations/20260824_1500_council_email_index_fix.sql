-- Fix: PostgREST on_conflict needs a plain (non-partial, non-expression) unique
-- index. Emails are always stored lowercased by the discovery fn, so a plain
-- unique on (campus_id, council_type, email) is equivalent and upsertable.
begin;
drop index if exists public.ccc_email_uidx;
create unique index if not exists ccc_email_uidx
  on public.campus_council_contacts (campus_id, council_type, email);
commit;
