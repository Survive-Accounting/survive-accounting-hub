-- 0040_orders_notify.sql — text + email Lee the moment an order lands.
-- Mirrors 0011 (campus_waitlist_notify), but SECRET-FREE: the x-order-secret is
-- read from Supabase Vault by name ('order_notify_secret') at trigger time, NOT
-- hardcoded in the repo. The Vault secret and the ORDER_NOTIFY_SECRET function
-- secret are set out-of-band via the Management API (never committed). After 0039.

create or replace function public.notify_order_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  begin
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'order_notify_secret'
    limit 1;
  exception when others then
    v_secret := null;
  end;

  perform net.http_post(
    url := 'https://unvxagsledbsdoremqeb.supabase.co/functions/v1/notify-order',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-order-secret', coalesce(v_secret, '')
    ),
    body := jsonb_build_object('record', row_to_json(new))
  );
  return new;
end;
$$;

drop trigger if exists orders_notify on public.orders;
create trigger orders_notify
  after insert on public.orders
  for each row execute function public.notify_order_insert();

notify pgrst, 'reload schema';
