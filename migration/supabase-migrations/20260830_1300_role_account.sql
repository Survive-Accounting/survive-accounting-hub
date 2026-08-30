-- Role-account flag on contacts. Emails like president@/ifc@ belong to a rotating position,
-- not a person — mark them so a semester-refresh pass can list and re-verify them all at once.
alter table public.growth_contact_qc
  add column if not exists is_role_account boolean not null default false;
comment on column public.growth_contact_qc.is_role_account is
  'True when the contact is a role/position inbox (president@, ifc@, scholarship@) that turns over each year, not a specific person.';
