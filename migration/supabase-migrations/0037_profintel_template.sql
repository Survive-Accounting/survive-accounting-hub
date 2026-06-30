-- 0037_profintel_template.sql
-- Replace the placeholder ProfIntel base template (seeded in 0036) with Lee's real
-- hand-written outreach email. Subject is just the campus course prefix; the greeting
-- uses the Dr./Mr./Ms. rule via {recipient_name}. Tokens resolved client-side in
-- src/lib/profintel.ts renderTemplate(): {recipient_name}, {course_prefix},
-- {first_name}, {last_name}, {full_name}, {school}, {course}, {rmp_rating}.
-- Idempotent: a plain UPDATE of the singleton row (id=1). After 0036.

update public.profintel_template
set
  subject = 'If any {course_prefix} students need a tutor this July',
  body = $body$Hi {recipient_name},

I'm Lee Ingram — an Ole Miss alum who tutors Intro and Intermediate Accounting full-time. I'd love to be a resource for any of your {course_prefix} students who want extra help this July.

They can text me anytime at (662) 565-8818.

Thanks,
Lee Ingram
surviveaccounting.com

—

A bit more, if you're curious before sharing ↓

• I've tutored since 2015 and genuinely love it — I treat every student with a lot of care.
• I supplement your lectures, not replace them; my focus is simply building exam confidence and enjoyment of the material.
• Happy to share reviews from past students anytime.$body$,
  updated_at = now()
where id = 1;

notify pgrst, 'reload schema';
