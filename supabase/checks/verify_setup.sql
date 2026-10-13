-- 設計図がSupabaseに正しく入ったかの確認
-- SQL Editor に貼って実行してください。「すべてOK」の1行だけが出れば成功です。
-- それ以外の行が出たら、その内容を教えてください（秘密の情報は含まれません）。

with problems as (
  -- 1. 表の数（17個のはず）
  select '表の数が違う' as problem, count(*)::text as detail
  from pg_tables where schemaname = 'public'
  having count(*) <> 17

  -- 2. 鍵（RLS）がかかっていない表
  union all
  select 'RLSがOFFの表', c.relname::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity

  -- 3. ログイン前の人（anon）が触れる表
  union all
  select 'ログイン前の人が触れる表', table_name || '：' || privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'

  -- 4. ログイン済みの人が、秘密の表に触れる
  union all
  select 'ログイン済みの人が秘密の表に触れる', table_name || '：' || privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated'
    and table_name in ('app_settings', 'restore_tokens', 'handoff_codes', 'attempt_logs', 'heartbeats')

  -- 5. ログイン済みの人が、表の行を丸ごと書き換えられる（列ごとの許可だけのはず）
  union all
  select 'ログイン済みの人が表全体を更新できる', table_name
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'UPDATE'

  -- 6. ログイン前の人が呼べる関数（2つだけのはず）
  union all
  select 'ログイン前の人が呼べる関数', p.proname::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in ('get_app_info', 'get_invite_info')

  -- 7. サーバー専用の関数を、ログイン済みの人が呼べる
  union all
  select 'サーバー専用の関数が呼べてしまう', p.proname::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('run_daily_maintenance', 'list_orphan_anonymous_users', 'keepalive_check', 'reset_demo', 'seed_demo_room')
    and has_function_privilege('authenticated', p.oid, 'execute')

  -- 8. サーバーが呼べるはずの関数を呼べない
  union all
  select 'サーバーが関数を呼べない', p.proname::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('run_daily_maintenance', 'list_orphan_anonymous_users', 'keepalive_check', 'reset_demo', 'seed_demo_room')
    and not has_function_privilege('service_role', p.oid, 'execute')

  -- 9. リアルタイム同期の対象になっていない表（9個のはず）
  union all
  select 'リアルタイム同期の対象が違う', count(*)::text
  from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public'
  having count(*) <> 9

  -- 10. 設定の行がない
  union all
  select '設定（app_settings）の行がない', ''
  where not exists (select 1 from public.app_settings where id = 1)
)
select problem, detail from problems
union all
select 'すべてOK', '' where not exists (select 1 from problems);
