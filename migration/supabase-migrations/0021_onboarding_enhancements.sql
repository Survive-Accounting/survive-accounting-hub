-- 0021_onboarding_enhancements.sql
-- Onboarding flow enhancements (idempotent — safe to run more than once).
--
-- 1) Booking step: track whether a student confirmed (or just saw) the
--    "Book your free 30-minute call" step that now runs after submit.
-- 2) SMS auto-reply: replace the one-time `opener_sent` gate with a recurring,
--    cooldown-based generic auto-reply. `opener_sent` is intentionally kept for
--    backward-compat; `last_auto_reply_at` is the new gate.
--
-- Numbered 0021 = next after main's highest (0020), per docs/DEPLOY.md.
-- HEADS-UP: the concurrent JE-tool branch also wrote a `0021_je_scenarios.sql`.
-- When these branches merge, renumber one of them so there are no duplicate
-- numbers, and apply them in order.

-- 1) Booking step columns -----------------------------------------------------
alter table public.student_intake_submissions
  add column if not exists booking_confirmed_at timestamptz,
  add column if not exists booking_step_completed_at timestamptz;

-- 2) SMS auto-reply cooldown --------------------------------------------------
alter table public.sms_conversations
  add column if not exists last_auto_reply_at timestamptz;

-- 3) Seed the generic auto-reply template so Lee can edit it without a deploy.
--    Code carries the same copy as a FALLBACK, so this seed is optional; we use
--    a NOT EXISTS guard (rather than ON CONFLICT) to stay idempotent regardless
--    of whether `key` has a unique constraint.
insert into public.sms_templates (key, label, description, body)
select
  'auto_reply_generic',
  'Generic SMS auto-reply',
  'Sent to a student on first contact and re-sent after a cooldown. Always hands them their personal /o/{short_ref} link. Tokens: {SITE_ORIGIN}, {short_ref}.',
  $tpl$Hey! It's Lee 👋 Thanks for reaching out. Here's your link to get started, pick up where you left off, or manage everything:

{SITE_ORIGIN}/o/{short_ref}

Reply here anytime with questions — I read every text.$tpl$
where not exists (
  select 1 from public.sms_templates where key = 'auto_reply_generic'
);
