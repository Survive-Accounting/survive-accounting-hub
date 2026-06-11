-- 0016: Force-overwrite the three follow-up templates with Lee's seeded copy.
-- Earlier seeds were either missed or overwritten by AI-generated placeholders.
-- This unconditionally restores the canonical copy and marks each Active+Locked.

update public.outreach_email_templates
set name = 'Office hours backlog',
    subject = 'Office hours backlog',
    body = 'Hi {recipient name},

I''m sure there are always more struggling students than office hours to support them.

That''s the gap I fill. I tutor {course prefix} and I''d love to be the person you can point students to when they need more than you can give.

If anyone needs help, send them my way — they can just text me at {phone} or book at {surviveaccounting.com}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee',
    is_active = true,
    is_locked = true
where kind = 'follow_up_1' and variant = 'default';

insert into public.outreach_email_templates (name, kind, variant, subject, body, is_active, is_locked)
select 'Office hours backlog', 'follow_up_1', 'default', 'Office hours backlog', 'Hi {recipient name},

I''m sure there are always more struggling students than office hours to support them.

That''s the gap I fill. I tutor {course prefix} and I''d love to be the person you can point students to when they need more than you can give.

If anyone needs help, send them my way — they can just text me at {phone} or book at {surviveaccounting.com}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', true, true
where not exists (select 1 from public.outreach_email_templates where kind = 'follow_up_1' and variant = 'default');

update public.outreach_email_templates
set name = 'a bit about me',
    subject = 'a bit about me',
    body = 'Hi {recipient name},

Quick background since I''m asking you to trust me to tutor your {course prefix} students:

* I studied accounting at Ole Miss and fell in love with it
* I''ve tutored it full-time since 2015 — over 1,000 students
* I also teach in Ole Miss''s entrepreneurship program

This isn''t a side hustle for me; taking care of students is my whole career.

If anyone needs help, send them my way — they can just text me at {phone} or book at {surviveaccounting.com}.

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee',
    is_active = true,
    is_locked = true
where kind = 'follow_up_2' and variant = 'default';

insert into public.outreach_email_templates (name, kind, variant, subject, body, is_active, is_locked)
select 'a bit about me', 'follow_up_2', 'default', 'a bit about me', 'Hi {recipient name},

Quick background since I''m asking you to trust me to tutor your {course prefix} students:

* I studied accounting at Ole Miss and fell in love with it
* I''ve tutored it full-time since 2015 — over 1,000 students
* I also teach in Ole Miss''s entrepreneurship program

This isn''t a side hustle for me; taking care of students is my whole career.

If anyone needs help, send them my way — they can just text me at {phone} or book at {surviveaccounting.com}.

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', true, true
where not exists (select 1 from public.outreach_email_templates where kind = 'follow_up_2' and variant = 'default');

update public.outreach_email_templates
set name = 'tutoring slots open',
    subject = 'tutoring slots open',
    body = 'Hi {recipient name},

I''ve got tutoring slots available for {course prefix} students. If anyone needs help, send them my way — they can just text me at {phone}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee',
    is_active = true,
    is_locked = true
where kind = 'follow_up_3' and variant = 'default';

insert into public.outreach_email_templates (name, kind, variant, subject, body, is_active, is_locked)
select 'tutoring slots open', 'follow_up_3', 'default', 'tutoring slots open', 'Hi {recipient name},

I''ve got tutoring slots available for {course prefix} students. If anyone needs help, send them my way — they can just text me at {phone}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', true, true
where not exists (select 1 from public.outreach_email_templates where kind = 'follow_up_3' and variant = 'default');
