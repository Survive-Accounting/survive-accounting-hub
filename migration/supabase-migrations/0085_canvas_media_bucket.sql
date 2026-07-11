-- 0085: canvas-media storage bucket for Present Canvas image cards.
-- MANUAL APPLY: paste into the Supabase SQL editor (live project unvxagsledbsdoremqeb).
-- Public READ (images render straight off the CDN URL); writes happen only through
-- the service-role server fn (uploadCanvasMedia) — no client write policy on purpose.

insert into storage.buckets (id, name, public)
values ('canvas-media', 'canvas-media', true)
on conflict (id) do nothing;

-- Public read of objects in this bucket (bucket.public covers the CDN path;
-- this policy covers API reads for completeness).
drop policy if exists "canvas media public read" on storage.objects;
create policy "canvas media public read" on storage.objects
  for select using (bucket_id = 'canvas-media');

-- No insert/update/delete policies: deny-by-default for anon/authenticated;
-- the service role bypasses RLS.
