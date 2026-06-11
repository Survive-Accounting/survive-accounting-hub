-- 0013: Seed Lee's follow-up templates + the semester broadcast calendar (through Fall 2028).
-- Templates are active immediately - the +7/+14/+21 sequence turns ON when this runs.
-- Every broadcast below is fully editable/cancelable in the Custom Emails panel.

insert into public.outreach_email_templates (name, kind, variant, subject, body, is_active, is_locked)
select 'Office hours backlog', 'follow_up_1', 'default', 'Office hours backlog', 'Hi {recipient name},

I''m sure there are always more struggling students than office hours to support them.

That''s the gap I fill. I tutor {course prefix} and I''d love to be the person you can point students to when they need more than you can give.

If anyone needs help, send them my way — they can just text me at {phone} or book at {surviveaccounting.com}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', true, true
where not exists (select 1 from public.outreach_email_templates where kind = 'follow_up_1' and variant = 'default');

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

insert into public.outreach_email_templates (name, kind, variant, subject, body, is_active, is_locked)
select 'tutoring slots open', 'follow_up_3', 'default', 'tutoring slots open', 'Hi {recipient name},

I''ve got tutoring slots available for {course prefix} students. If anyone needs help, send them my way — they can just text me at {phone}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', true, true
where not exists (select 1 from public.outreach_email_templates where kind = 'follow_up_3' and variant = 'default');

-- Semester calendar (all campuses, includes warm/replied professors)
insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Fall 2026 — Syllabus week (08-24)', 'here for the new semester', 'Hi {recipient name},

New semester — I hope it''s off to a smooth start. Just a reminder that I''m here if any of your {course prefix} students need backup early. Catching them before the first exam makes all the difference.

They can text me anytime at {phone} or book at {surviveaccounting.com}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2026-08-24T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Fall 2026 — Syllabus week (08-24)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Fall 2026 — Exam 1 season (09-21)', 'first exams coming up', 'Hi {recipient name},

First exams are around the corner. I do exam-prep sessions for {course prefix} students — if anyone''s struggling, send them my way. They can just text me at {phone}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2026-09-21T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Fall 2026 — Exam 1 season (09-21)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Fall 2026 — Midterms (10-19)', 'tutoring slots open', 'Hi {recipient name},

I''ve got tutoring slots available for {course prefix} students this midterm stretch. If anyone needs help, send them my way — they can just text me at {phone}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2026-10-19T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Fall 2026 — Midterms (10-19)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Fall 2026 — Grade rescue window (11-16)', 'for students on the bubble', 'Hi {recipient name},

This is the time of semester when students are deciding whether they can still save their grade. That''s honestly my specialty — getting someone from panicking to passing.

If you''ve got {course prefix} students on the bubble, send them my way. They can text me at {phone} or book at {surviveaccounting.com}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2026-11-16T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Fall 2026 — Grade rescue window (11-16)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Fall 2026 — Finals push (12-01)', 'finals push', 'Hi {recipient name},

Finals push. The fastest way for a {course prefix} student to reach me is a text: {phone}

I''ll do everything I can to get them across the line.

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2026-12-01T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Fall 2026 — Finals push (12-01)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Spring 2027 — Syllabus week (01-25)', 'here for the new semester', 'Hi {recipient name},

New semester — I hope it''s off to a smooth start. Just a reminder that I''m here if any of your {course prefix} students need backup early. Catching them before the first exam makes all the difference.

They can text me anytime at {phone} or book at {surviveaccounting.com}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2027-01-25T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Spring 2027 — Syllabus week (01-25)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Spring 2027 — Exam 1 season (02-22)', 'first exams coming up', 'Hi {recipient name},

First exams are around the corner. I do exam-prep sessions for {course prefix} students — if anyone''s struggling, send them my way. They can just text me at {phone}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2027-02-22T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Spring 2027 — Exam 1 season (02-22)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Spring 2027 — Midterms (03-22)', 'tutoring slots open', 'Hi {recipient name},

I''ve got tutoring slots available for {course prefix} students this midterm stretch. If anyone needs help, send them my way — they can just text me at {phone}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2027-03-22T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Spring 2027 — Midterms (03-22)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Spring 2027 — Grade rescue window (04-12)', 'for students on the bubble', 'Hi {recipient name},

This is the time of semester when students are deciding whether they can still save their grade. That''s honestly my specialty — getting someone from panicking to passing.

If you''ve got {course prefix} students on the bubble, send them my way. They can text me at {phone} or book at {surviveaccounting.com}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2027-04-12T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Spring 2027 — Grade rescue window (04-12)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Spring 2027 — Finals push (04-26)', 'finals push', 'Hi {recipient name},

Finals push. The fastest way for a {course prefix} student to reach me is a text: {phone}

I''ll do everything I can to get them across the line.

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2027-04-26T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Spring 2027 — Finals push (04-26)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Fall 2027 — Syllabus week (08-23)', 'here for the new semester', 'Hi {recipient name},

New semester — I hope it''s off to a smooth start. Just a reminder that I''m here if any of your {course prefix} students need backup early. Catching them before the first exam makes all the difference.

They can text me anytime at {phone} or book at {surviveaccounting.com}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2027-08-23T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Fall 2027 — Syllabus week (08-23)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Fall 2027 — Exam 1 season (09-20)', 'first exams coming up', 'Hi {recipient name},

First exams are around the corner. I do exam-prep sessions for {course prefix} students — if anyone''s struggling, send them my way. They can just text me at {phone}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2027-09-20T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Fall 2027 — Exam 1 season (09-20)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Fall 2027 — Midterms (10-18)', 'tutoring slots open', 'Hi {recipient name},

I''ve got tutoring slots available for {course prefix} students this midterm stretch. If anyone needs help, send them my way — they can just text me at {phone}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2027-10-18T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Fall 2027 — Midterms (10-18)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Fall 2027 — Grade rescue window (11-15)', 'for students on the bubble', 'Hi {recipient name},

This is the time of semester when students are deciding whether they can still save their grade. That''s honestly my specialty — getting someone from panicking to passing.

If you''ve got {course prefix} students on the bubble, send them my way. They can text me at {phone} or book at {surviveaccounting.com}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2027-11-15T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Fall 2027 — Grade rescue window (11-15)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Fall 2027 — Finals push (12-01)', 'finals push', 'Hi {recipient name},

Finals push. The fastest way for a {course prefix} student to reach me is a text: {phone}

I''ll do everything I can to get them across the line.

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2027-12-01T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Fall 2027 — Finals push (12-01)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Spring 2028 — Syllabus week (01-24)', 'here for the new semester', 'Hi {recipient name},

New semester — I hope it''s off to a smooth start. Just a reminder that I''m here if any of your {course prefix} students need backup early. Catching them before the first exam makes all the difference.

They can text me anytime at {phone} or book at {surviveaccounting.com}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2028-01-24T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Spring 2028 — Syllabus week (01-24)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Spring 2028 — Exam 1 season (02-21)', 'first exams coming up', 'Hi {recipient name},

First exams are around the corner. I do exam-prep sessions for {course prefix} students — if anyone''s struggling, send them my way. They can just text me at {phone}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2028-02-21T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Spring 2028 — Exam 1 season (02-21)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Spring 2028 — Midterms (03-20)', 'tutoring slots open', 'Hi {recipient name},

I''ve got tutoring slots available for {course prefix} students this midterm stretch. If anyone needs help, send them my way — they can just text me at {phone}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2028-03-20T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Spring 2028 — Midterms (03-20)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Spring 2028 — Grade rescue window (04-10)', 'for students on the bubble', 'Hi {recipient name},

This is the time of semester when students are deciding whether they can still save their grade. That''s honestly my specialty — getting someone from panicking to passing.

If you''ve got {course prefix} students on the bubble, send them my way. They can text me at {phone} or book at {surviveaccounting.com}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2028-04-10T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Spring 2028 — Grade rescue window (04-10)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Spring 2028 — Finals push (04-24)', 'finals push', 'Hi {recipient name},

Finals push. The fastest way for a {course prefix} student to reach me is a text: {phone}

I''ll do everything I can to get them across the line.

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2028-04-24T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Spring 2028 — Finals push (04-24)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Fall 2028 — Syllabus week (08-21)', 'here for the new semester', 'Hi {recipient name},

New semester — I hope it''s off to a smooth start. Just a reminder that I''m here if any of your {course prefix} students need backup early. Catching them before the first exam makes all the difference.

They can text me anytime at {phone} or book at {surviveaccounting.com}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2028-08-21T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Fall 2028 — Syllabus week (08-21)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Fall 2028 — Exam 1 season (09-18)', 'first exams coming up', 'Hi {recipient name},

First exams are around the corner. I do exam-prep sessions for {course prefix} students — if anyone''s struggling, send them my way. They can just text me at {phone}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2028-09-18T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Fall 2028 — Exam 1 season (09-18)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Fall 2028 — Midterms (10-16)', 'tutoring slots open', 'Hi {recipient name},

I''ve got tutoring slots available for {course prefix} students this midterm stretch. If anyone needs help, send them my way — they can just text me at {phone}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2028-10-16T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Fall 2028 — Midterms (10-16)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Fall 2028 — Grade rescue window (11-13)', 'for students on the bubble', 'Hi {recipient name},

This is the time of semester when students are deciding whether they can still save their grade. That''s honestly my specialty — getting someone from panicking to passing.

If you''ve got {course prefix} students on the bubble, send them my way. They can text me at {phone} or book at {surviveaccounting.com}

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2028-11-13T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Fall 2028 — Grade rescue window (11-13)');

insert into public.outreach_broadcasts (name, subject, body, campus_ids, include_replied, send_at, status)
select 'Fall 2028 — Finals push (12-01)', 'finals push', 'Hi {recipient name},

Finals push. The fastest way for a {course prefix} student to reach me is a text: {phone}

I''ll do everything I can to get them across the line.

If you''d rather not get these, just reply and I''ll stop.

Thanks, Lee', null, true, '2028-12-01T15:30:00Z', 'scheduled'
where not exists (select 1 from public.outreach_broadcasts where name = 'Fall 2028 — Finals push (12-01)');
