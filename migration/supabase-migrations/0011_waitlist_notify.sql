-- 0011: Waitlist follow-up tracking + instant text-to-Lee on new signups.

alter table public.campus_waitlist add column if not exists contacted_at timestamptz;
create policy "anon update campus_waitlist" on public.campus_waitlist for update to anon using (true) with check (true);
grant update on public.campus_waitlist to anon, authenticated;

-- New waitlist row -> text Lee (server-side, survives any client failure).
-- Secret must match the CRON_SECRET secret in Lovable.
create or replace function public.notify_waitlist_signup()
returns trigger language plpgsql security definer as $$
begin
  perform net.http_post(
    url := 'https://dhlzorresurzlcpuplkv.supabase.co/functions/v1/notify-waitlist',
    headers := '{"Content-Type":"application/json","x-cron-secret":"sa-cron-7kQ2vXp9mN4t"}'::jsonb,
    body := jsonb_build_object('record', row_to_json(new))
  );
  return new;
end;
$$;

drop trigger if exists campus_waitlist_notify on public.campus_waitlist;
create trigger campus_waitlist_notify
  after insert on public.campus_waitlist
  for each row execute function public.notify_waitlist_signup();
