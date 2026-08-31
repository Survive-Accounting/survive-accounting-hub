-- Role-account can now apply to the email OR the Instagram independently: a named officer often
-- has a personal IG (keep) but a role inbox email (president@, turns over). is_role_account stays
-- the EMAIL flag; ig_role_account is the Instagram flag. The semester-refresh filter matches either.
alter table public.growth_contact_qc
  add column if not exists ig_role_account boolean not null default false;
comment on column public.growth_contact_qc.ig_role_account is
  'True when the Instagram handle is an org/position account (turns over), not a person''s own. Email role-account is is_role_account.';
