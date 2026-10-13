-- Сколько записей в главных таблицах. Пишется рядом с каждой копией (backup-db.sh) и сверяется
-- после восстановления (restore-check.sh, restore-db.sh). Таблицы ИКР считаются, только если они уже есть.
select json_object_agg(t, n order by t) from (
  select 'auth.users' t, count(*) n from auth.users
  union all select 'storage.objects', count(*) from storage.objects
  union all select 'public.tables', count(*) from pg_tables where schemaname = 'public'
  union all
  select 'public.' || c.relname,
         (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint
  from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind = 'r'
    and c.relname in ('profiles', 'companies', 'invitations', 'requests', 'candidates', 'audit_log')
) x;
