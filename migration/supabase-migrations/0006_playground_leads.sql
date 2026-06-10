-- 0006: PLAYGROUND-ONLY anon access for professor leads.
-- ⚠️ BEFORE REAL LAUNCH: drop these and add auth (see 0005 for the pattern).
create policy "anon read outreach_leads" on public.outreach_leads for select to anon using (true);
create policy "anon insert outreach_leads" on public.outreach_leads for insert to anon with check (true);
create policy "anon update outreach_leads" on public.outreach_leads for update to anon using (true) with check (true);
create policy "anon delete outreach_leads" on public.outreach_leads for delete to anon using (true);
-- TO LOCK DOWN LATER:
-- drop policy "anon read outreach_leads" on public.outreach_leads;
-- drop policy "anon insert outreach_leads" on public.outreach_leads;
-- drop policy "anon update outreach_leads" on public.outreach_leads;
-- drop policy "anon delete outreach_leads" on public.outreach_leads;
