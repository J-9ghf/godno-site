-- Закрытые хранилища файлов. Публичных ссылок нет: файлы отдаются только по временной ссылке,
-- которую сервер выдаёт после проверки доступа через RLS (client_candidates, documents).
-- При переезде на S3-совместимое хранилище (Yandex Object Storage, Selectel) эти бакеты
-- создаются как приватные, а правила доступа остаются в коде сервера.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('resumes', 'resumes', false, 10485760, array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]),
  ('videos', 'videos', false, null, array['video/mp4', 'video/webm', 'video/quicktime']),
  ('documents', 'documents', false, 20971520, null),
  ('attachments', 'attachments', false, 20971520, null)
on conflict (id) do nothing;

-- Команда работает с файлами напрямую. У клиентов и анонимов политик нет.
create policy staff_files_read on storage.objects for select to authenticated
  using (bucket_id in ('resumes', 'videos', 'documents', 'attachments') and app.is_staff());
create policy staff_files_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('resumes', 'videos', 'documents', 'attachments') and app.is_staff());
create policy staff_files_update on storage.objects for update to authenticated
  using (bucket_id in ('resumes', 'videos', 'documents', 'attachments') and app.is_staff())
  with check (bucket_id in ('resumes', 'videos', 'documents', 'attachments') and app.is_staff());
create policy admin_files_delete on storage.objects for delete to authenticated
  using (bucket_id in ('resumes', 'videos', 'documents', 'attachments') and app.is_admin());
