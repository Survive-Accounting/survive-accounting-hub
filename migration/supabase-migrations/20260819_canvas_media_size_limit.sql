-- CANVAS-MEDIA UPLOAD SIZE LIMIT (08-19) — raise the cap so long film takes upload.
--
-- SYMPTOM: keeping an 82s take failed with "The object exceeded the maximum
-- allowed size". Take uploads go STRAIGHT to Supabase Storage (uploadToSignedUrl),
-- so the only cap is Supabase's upload limit. The canvas-media bucket was created
-- (0085) with NO file_size_limit, so it inherits the PROJECT global limit — 50 MB
-- by default. A screen recording of a minute+ blows past that.
--
-- ⚠️ TWO PLACES MUST BE RAISED — this SQL is only ONE of them:
--   1. PROJECT global limit (THE ONE THAT ACTUALLY GATES IT): Supabase Dashboard
--      → Storage → Settings → "Upload file size limit". Raise to e.g. 5 GB. This
--      is a project setting; it CANNOT be changed from SQL, and a bucket limit
--      higher than the global is still capped by the global.
--   2. The bucket file_size_limit below (so the bucket doesn't cap under it).
--
-- 5 GiB is far above any real take; lower it if you prefer a tighter guard.

update storage.buckets
set file_size_limit = 5368709120  -- 5 GiB
where id = 'canvas-media';
