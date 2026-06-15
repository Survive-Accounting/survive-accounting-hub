
do $$ begin
  create policy "anon upload course-syllabi"
    on storage.objects for insert to anon
    with check (bucket_id = 'course-syllabi');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "auth upload course-syllabi"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'course-syllabi');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "auth read course-syllabi"
    on storage.objects for select to authenticated
    using (bucket_id = 'course-syllabi');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "auth manage course-syllabi"
    on storage.objects for all to authenticated
    using (bucket_id = 'course-syllabi')
    with check (bucket_id = 'course-syllabi');
exception when duplicate_object then null; end $$;
