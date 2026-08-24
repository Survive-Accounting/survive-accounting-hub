-- Course Intel cockpit: professor review + student-visibility.
-- Approving a scraped professor should promote them to BOTH outreach and the
-- student player (a "pick your professor" list). student_visible is what the
-- player reads; the scraped email is never exposed student-side.
begin;
alter table public.campus_lead_suggestions add column if not exists student_visible boolean not null default false;
alter table public.campus_lead_suggestions add column if not exists reviewed_at timestamptz null;
alter table public.campus_lead_suggestions add column if not exists reviewed_by text null;
-- Fast lookups for the player's per-campus professor list.
create index if not exists cls_student_visible_idx
  on public.campus_lead_suggestions (campus_id) where student_visible = true;
commit;
