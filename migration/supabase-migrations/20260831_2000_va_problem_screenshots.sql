-- Screenshots for VA "report a problem". A public bucket so the URLs in Lee's email just open;
-- uploads only ever happen server-side through the service role (which bypasses RLS), so no write
-- policy is needed. Idempotent.
insert into storage.buckets (id, name, public)
  values ('va-problems', 'va-problems', true)
  on conflict (id) do nothing;
