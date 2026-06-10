-- 0005: PLAYGROUND-ONLY anon access.
-- The new app has no login yet, so the previewer runs as the anonymous role.
-- This grants anon the access the dashboard needs while we build.
--
-- ⚠️ BEFORE REAL LAUNCH: run the drop statements at the bottom and add auth.

-- Read access for dashboard data
create policy "anon read campus_tam_estimates" on public.campus_tam_estimates for select to anon using (true);
create policy "anon read outreach_email_templates" on public.outreach_email_templates for select to anon using (true);
create policy "anon read outreach_va_campus_assignments" on public.outreach_va_campus_assignments for select to anon using (true);
create policy "anon read va_accounts" on public.va_accounts for select to anon using (true);
create policy "anon read outreach_saved_views" on public.outreach_saved_views for select to anon using (true);

-- Write access for the workflows (approve campus, assign, edit templates)
create policy "anon update campuses" on public.campuses for update to anon using (true) with check (true);
create policy "anon write outreach_email_templates" on public.outreach_email_templates for insert to anon with check (true);
create policy "anon update outreach_email_templates" on public.outreach_email_templates for update to anon using (true) with check (true);
create policy "anon write outreach_va_campus_assignments" on public.outreach_va_campus_assignments for insert to anon with check (true);
create policy "anon update outreach_va_campus_assignments" on public.outreach_va_campus_assignments for update to anon using (true) with check (true);
create policy "anon delete outreach_va_campus_assignments" on public.outreach_va_campus_assignments for delete to anon using (true);

-- ============================================================
-- TO LOCK DOWN LATER (run these once auth exists):
-- drop policy "anon read campus_tam_estimates" on public.campus_tam_estimates;
-- drop policy "anon read outreach_email_templates" on public.outreach_email_templates;
-- drop policy "anon read outreach_va_campus_assignments" on public.outreach_va_campus_assignments;
-- drop policy "anon read va_accounts" on public.va_accounts;
-- drop policy "anon read outreach_saved_views" on public.outreach_saved_views;
-- drop policy "anon update campuses" on public.campuses;
-- drop policy "anon write outreach_email_templates" on public.outreach_email_templates;
-- drop policy "anon update outreach_email_templates" on public.outreach_email_templates;
-- drop policy "anon write outreach_va_campus_assignments" on public.outreach_va_campus_assignments;
-- drop policy "anon update outreach_va_campus_assignments" on public.outreach_va_campus_assignments;
-- drop policy "anon delete outreach_va_campus_assignments" on public.outreach_va_campus_assignments;
