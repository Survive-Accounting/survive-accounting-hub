-- 0032_preview_feedback.sql
-- Feedback surface for the email-gated shell "preview" dashboard (/preview).
-- Testers (former students Lee invites + onboarding finishers) leave reactions
-- and comments per course/chapter; this is the hero feature that reframes the
-- empty roadmap as participation. Tester identity is just an email (no account).
-- Anon insert is allowed (RLS below) so the client can write directly, mirroring
-- campus_waitlist. Idempotent — safe to re-run. After the high-water mark (0031).

create table if not exists public.preview_feedback (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  course        text,                 -- course family key: intro_1 | intro_2 | intermediate_1 | intermediate_2
  chapter       text,                 -- chapter label/number the feedback is about (null = general)
  reaction      text,                 -- 'would_use' | null
  comment       text,
  source        text default 'preview_dashboard',
  created_at    timestamptz default now()
);

create index if not exists preview_feedback_email_idx on public.preview_feedback (email);
create index if not exists preview_feedback_course_idx on public.preview_feedback (course);

alter table public.preview_feedback enable row level security;

-- Anyone (anon) may submit feedback; nobody may read it back from the client.
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='preview_feedback' and policyname='preview_feedback_anon_insert'
  ) then
    create policy preview_feedback_anon_insert on public.preview_feedback
      for insert to anon, authenticated with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
