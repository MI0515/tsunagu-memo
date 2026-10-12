-- つなぐメモ：DB関数（重要な操作はここでまとめて、安全に行う）
-- 失敗を記録してロックする関数は、エラーで中断するとその記録まで取り消されるため、
-- 例外ではなく {"ok": false, "error": "..."} を返す。

-- ---------------------------------------------------------------
-- 内部用の小さな関数
-- ---------------------------------------------------------------
create or replace function public._client_ip()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(trim(split_part(coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), '')
$$;

create or replace function public._sha256(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p, 'sha256'), 'hex')
$$;

create or replace function public._random_token(p_bytes int)
returns text
language sql
volatile
set search_path = ''
as $$
  select encode(extensions.gen_random_bytes(p_bytes), 'hex')
$$;

-- 10分以内に5回失敗していたら true
create or replace function public._is_locked(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) >= 5
  from public.attempt_logs
  where kind = p_kind
    and actor in (coalesce(public._client_ip(), '-'), coalesce(auth.uid()::text, '-'))
    and created_at > now() - interval '10 minutes'
$$;

create or replace function public._log_failure(p_kind text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.attempt_logs (actor, kind)
  select a, p_kind
  from unnest(array[public._client_ip(), auth.uid()::text]) as a
  where a is not null
$$;

create or replace function public._fail(p_error text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('ok', false, 'error', p_error)
$$;

-- 項目がその日に表示されるか
create or replace function public.item_occurs_on(i public.items, d date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case i.kind
    when 'once' then i.date = d
    else d >= i.starts_on
      and (i.ends_on is null or d <= i.ends_on)
      and case i.kind
        when 'daily' then true
        when 'weekly' then extract(dow from d)::smallint = any (i.weekdays)
        when 'monthly' then extract(day from d)::int = least(
          i.month_day::int,
          extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::int)
        else false
      end
  end
$$;

-- ---------------------------------------------------------------
-- 画面から呼ぶ関数
-- ---------------------------------------------------------------

-- アプリ全体の公開してよい設定
create or replace function public.get_app_info()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'is_demo', s.is_demo,
    'inactive_warn_days', s.inactive_warn_days,
    'inactive_cleanup_days', s.inactive_cleanup_days,
    'requires_creation_code', not s.is_demo)
  from public.app_settings s
$$;

-- その日の項目（ホーム・ふりかえり用。RLSがそのまま効く）
create or replace function public.items_on(p_room_id uuid, p_date date)
returns setof public.items
language sql
stable
set search_path = ''
as $$
  select i.* from public.items i
  where i.room_id = p_room_id and public.item_occurs_on(i, p_date)
  order by i.position, i.created_at
$$;

-- ルーム作成（作成用コード・上限をチェックし、初期データも入れる）
create or replace function public.create_room(p_name text, p_display_name text, p_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  s public.app_settings;
  v_room_id uuid;
  v_template_id uuid;
begin
  if v_uid is null then return public._fail('not_signed_in'); end if;
  select * into s from public.app_settings where id = 1;

  if not s.is_demo then
    if public._is_locked('create_code') then return public._fail('locked'); end if;
    if s.creation_code_hash is null
       or p_code is null
       or extensions.crypt(p_code, s.creation_code_hash) <> s.creation_code_hash then
      perform public._log_failure('create_code');
      return public._fail('bad_code');
    end if;
  end if;

  if (select count(*) from public.rooms where created_by = v_uid) >= s.max_rooms_per_user then
    return public._fail('too_many_rooms');
  end if;
  if (select count(*) from public.rooms) >= s.max_rooms_total then
    return public._fail('service_full');
  end if;

  insert into public.rooms (name, created_by, member_limit)
  values (trim(p_name), v_uid, s.max_members_per_room)
  returning id into v_room_id;

  insert into public.room_members (room_id, user_id, display_name, role)
  values (v_room_id, v_uid, trim(p_display_name), 'owner');

  insert into public.templates (room_id, name) values (v_room_id, '普段と違う予定の日セット')
  returning id into v_template_id;

  insert into public.template_items (template_id, room_id, title, position)
  select v_template_id, v_room_id, t.title, t.pos
  from (values
    (1, '事前に、連絡が難しくなりそうな時間帯と、連絡できそうなタイミングを共有する'),
    (2, '朝（起きた時）にメモを確認する'),
    (3, '長く連絡が途絶えたあとは、詳しい説明より先に「無事であること」と「今の状況」を短く伝える'),
    (4, '相手の反応が気になって考え込みそうな時は、「気になることがあるので、落ち着いてからちゃんと話したい」とだけ先に送る'),
    (5, '夜（寝る前）にメモを確認し、できたか振り返る')
  ) as t (pos, title);

  insert into public.phrases (room_id, body, position)
  select v_room_id, p.body, p.pos
  from (values
    (1, '無事です。今は○○にいます。'),
    (2, '気になることがあるので、落ち着いてからちゃんと話したい。'),
    (3, '今は詳しく説明できないので、あとで改めて説明します。')
  ) as p (pos, body);

  insert into public.invites (room_id, token, created_by)
  values (v_room_id, public._random_token(24), v_uid);

  return jsonb_build_object('ok', true, 'room_id', v_room_id);
end;
$$;

-- 招待リンクの中身（参加画面でルーム名を出すため。ログイン前でも呼べる）
create or replace function public.get_invite_info(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object(
        'ok', true,
        'room_name', r.name,
        'expired', i.revoked_at is not null or i.expires_at <= now())
     from public.invites i join public.rooms r on r.id = i.room_id
     where i.token = p_token),
    public._fail('invalid_invite'))
$$;

-- 招待リンクで参加
create or replace function public.join_room(p_token text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.invites;
  v_limit int;
begin
  if v_uid is null then return public._fail('not_signed_in'); end if;
  if public._is_locked('invite') then return public._fail('locked'); end if;

  select * into v_invite from public.invites where token = p_token;
  if not found then
    perform public._log_failure('invite');
    return public._fail('invalid_invite');
  end if;
  if v_invite.revoked_at is not null or v_invite.expires_at <= now() then
    return public._fail('expired_invite');
  end if;

  if exists (select 1 from public.room_members where room_id = v_invite.room_id and user_id = v_uid) then
    return jsonb_build_object('ok', true, 'room_id', v_invite.room_id);
  end if;

  select member_limit into v_limit from public.rooms where id = v_invite.room_id for update;
  if (select count(*) from public.room_members where room_id = v_invite.room_id) >= v_limit then
    return public._fail('room_full');
  end if;

  insert into public.room_members (room_id, user_id, display_name, role)
  values (v_invite.room_id, v_uid, trim(p_display_name), 'member');

  return jsonb_build_object('ok', true, 'room_id', v_invite.room_id);
end;
$$;

-- 招待リンクの再発行（古いリンクは無効になる）
create or replace function public.regenerate_invite(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := public._random_token(24);
begin
  if not public.is_owner(p_room_id) then return public._fail('not_owner'); end if;
  update public.invites set revoked_at = now() where room_id = p_room_id and revoked_at is null;
  insert into public.invites (room_id, token, created_by) values (p_room_id, v_token, auth.uid());
  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

-- 招待リンクの無効化
create or replace function public.revoke_invites(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner(p_room_id) then return public._fail('not_owner'); end if;
  update public.invites set revoked_at = now() where room_id = p_room_id and revoked_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

-- オーナーを譲る
create or replace function public.transfer_owner(p_room_id uuid, p_new_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner(p_room_id) then return public._fail('not_owner'); end if;
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = p_new_owner) then
    return public._fail('not_member');
  end if;
  update public.room_members set role = 'member' where room_id = p_room_id and user_id = auth.uid();
  update public.room_members set role = 'owner' where room_id = p_room_id and user_id = p_new_owner;
  return jsonb_build_object('ok', true);
end;
$$;

-- ルームから退出（オーナーは先に譲る。1人だけならルームごと削除）
create or replace function public.leave_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_others int;
begin
  if not public.is_member(p_room_id) then return public._fail('not_member'); end if;
  select count(*) into v_others from public.room_members where room_id = p_room_id and user_id <> v_uid;

  if public.is_owner(p_room_id) then
    if v_others > 0 then return public._fail('transfer_first'); end if;
    delete from public.rooms where id = p_room_id;
    return jsonb_build_object('ok', true, 'room_deleted', true);
  end if;

  delete from public.room_members where room_id = p_room_id and user_id = v_uid;
  return jsonb_build_object('ok', true, 'room_deleted', false);
end;
$$;

-- メンバーを外す（オーナーのみ）
create or replace function public.remove_member(p_room_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner(p_room_id) then return public._fail('not_owner'); end if;
  if p_user_id = auth.uid() then return public._fail('cannot_remove_self'); end if;
  delete from public.room_members where room_id = p_room_id and user_id = p_user_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- 項目を消す（繰り返し項目は、過去の記録を残すため「昨日で終了」にする）
create or replace function public.remove_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.items;
  v_today date := public.jst_today();
begin
  select * into v_item from public.items where id = p_item_id;
  if not found or not public.is_member(v_item.room_id) then return public._fail('not_found'); end if;

  if v_item.kind = 'once'
     or v_item.starts_on >= v_today
     or not exists (select 1 from public.stamps where item_id = p_item_id and date < v_today) then
    delete from public.items where id = p_item_id;
  else
    update public.items set ends_on = v_today - 1 where id = p_item_id;
    delete from public.stamps where item_id = p_item_id and date >= v_today;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- テンプレを今日・明日に展開（同じ日付には1回だけ）
create or replace function public.expand_template(p_template_id uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_inserted int;
  v_next_pos int;
begin
  select room_id into v_room_id from public.templates where id = p_template_id;
  if v_room_id is null or not public.is_member(v_room_id) then return public._fail('not_found'); end if;
  if p_date not in (public.jst_today(), public.jst_today() + 1) then return public._fail('bad_date'); end if;

  insert into public.template_expansions (room_id, template_id, date, expanded_by)
  values (v_room_id, p_template_id, p_date, auth.uid())
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select coalesce(max(position), 0) into v_next_pos from public.items where room_id = v_room_id;

  insert into public.items (room_id, title, kind, date, position, template_id, created_by)
  select v_room_id, ti.title, 'once', p_date, v_next_pos + ti.position, p_template_id, auth.uid()
  from public.template_items ti
  where ti.template_id = p_template_id;

  return jsonb_build_object('ok', true, 'already', false);
end;
$$;

-- ---------------------------------------------------------------
-- 本人の引き継ぎ（復元リンク・引き継ぎコード）
-- ---------------------------------------------------------------

-- 自分専用の復元リンク用トークンを発行（再発行で古いものは無効）
create or replace function public.issue_restore_token()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := public._random_token(32);
begin
  if auth.uid() is null then return public._fail('not_signed_in'); end if;
  insert into public.restore_tokens (user_id, token_hash)
  values (auth.uid(), public._sha256(v_token))
  on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now();
  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

-- Safari → ホーム画面アプリ用の引き継ぎコード（10分・1回だけ）
create or replace function public.issue_handoff_code()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(12);
  v_code text := '';
begin
  if auth.uid() is null then return public._fail('not_signed_in'); end if;
  for i in 0..11 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  delete from public.handoff_codes where user_id = auth.uid();
  insert into public.handoff_codes (code_hash, user_id) values (public._sha256(v_code), auth.uid());
  return jsonb_build_object('ok', true,
    'code', substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4));
end;
$$;

-- 復元リンクか引き継ぎコードを使って、今の端末を「同じ本人」にする
-- 古い端末のメンバー情報・スタンプなどを、今の端末に移し替える
create or replace function public.redeem_identity(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new uuid := auth.uid();
  v_old uuid;
  v_code_hash text;
  v_token_hash text;
  v_owner_rooms uuid[];
begin
  if v_new is null then return public._fail('not_signed_in'); end if;
  if public._is_locked('identity') then return public._fail('locked'); end if;

  -- 引き継ぎコードは大文字・ハイフンなしにそろえて照合
  v_code_hash := public._sha256(upper(regexp_replace(coalesce(p_secret, ''), '[^A-Za-z0-9]', '', 'g')));
  v_token_hash := public._sha256(trim(coalesce(p_secret, '')));

  update public.handoff_codes set used_at = now()
  where code_hash = v_code_hash and used_at is null and expires_at > now()
  returning user_id into v_old;

  if v_old is null then
    select user_id into v_old from public.restore_tokens where token_hash = v_token_hash;
  end if;

  if v_old is null then
    perform public._log_failure('identity');
    return public._fail('invalid_secret');
  end if;
  if v_old = v_new then return jsonb_build_object('ok', true); end if;

  -- 同じルームに両方いる場合は、古い方（＝本人の履歴）を残す。今の端末側がオーナーなら引き継ぐ
  select coalesce(array_agg(nm.room_id), '{}') into v_owner_rooms
  from public.room_members nm
  where nm.user_id = v_new and nm.role = 'owner'
    and exists (select 1 from public.room_members om where om.room_id = nm.room_id and om.user_id = v_old);
  delete from public.room_members nm
  where nm.user_id = v_new
    and exists (select 1 from public.room_members om where om.room_id = nm.room_id and om.user_id = v_old);
  update public.room_members set role = 'owner' where user_id = v_old and room_id = any (v_owner_rooms);
  update public.room_members set user_id = v_new where user_id = v_old;

  delete from public.stamps ns
  where ns.user_id = v_new
    and exists (select 1 from public.stamps os
                where os.user_id = v_old and os.item_id = ns.item_id and os.date = ns.date and os.kind = ns.kind);
  update public.stamps set user_id = v_new where user_id = v_old;

  update public.rooms set created_by = v_new where created_by = v_old;
  update public.items set created_by = v_new where created_by = v_old;
  update public.day_stars set starred_by = v_new where starred_by = v_old;
  update public.invites set created_by = v_new where created_by = v_old;
  update public.template_expansions set expanded_by = v_new where expanded_by = v_old;

  -- 保存済みの復元リンクは、そのまま使い続けられるようにする
  delete from public.restore_tokens where user_id = v_new
    and exists (select 1 from public.restore_tokens where user_id = v_old);
  update public.restore_tokens set user_id = v_new where user_id = v_old;
  delete from public.handoff_codes where user_id = v_old;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------
-- 自動で動く処理（トリガー）
-- ---------------------------------------------------------------

-- 記録があったらルームの「最後に使われた日時」を更新（1時間に1回まで）
create or replace function public._touch_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.rooms set last_activity_at = now()
  where id = new.room_id and last_activity_at < now() - interval '1 hour';
  return new;
end;
$$;

create trigger touch_room_on_item after insert on public.items
  for each row execute function public._touch_room();
create trigger touch_room_on_stamp after insert on public.stamps
  for each row execute function public._touch_room();
create trigger touch_room_on_star after insert on public.day_stars
  for each row execute function public._touch_room();

-- 1ルーム1日あたりの項目追加数の上限（荒らし対策）
create or replace function public._limit_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.items
      where room_id = new.room_id
        and created_at >= (public.jst_today()::timestamp at time zone 'Asia/Tokyo'))
     >= (select max_items_per_room_per_day from public.app_settings where id = 1) then
    raise exception 'item_limit' using hint = '今日はこれ以上項目を追加できません';
  end if;
  return new;
end;
$$;

create trigger limit_items before insert on public.items
  for each row execute function public._limit_items();

-- テンプレ・定型文の数の上限
create or replace function public._limit_children()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_max int := tg_argv[0]::int;
begin
  if tg_table_name = 'template_items' then
    select count(*) into v_count from public.template_items where template_id = new.template_id;
  elsif tg_table_name = 'templates' then
    select count(*) into v_count from public.templates where room_id = new.room_id;
  else
    select count(*) into v_count from public.phrases where room_id = new.room_id;
  end if;
  if v_count >= v_max then
    raise exception 'limit_reached' using hint = 'これ以上追加できません';
  end if;
  return new;
end;
$$;

create trigger limit_templates before insert on public.templates
  for each row execute function public._limit_children('10');
create trigger limit_template_items before insert on public.template_items
  for each row execute function public._limit_children('30');
create trigger limit_phrases before insert on public.phrases
  for each row execute function public._limit_children('30');

-- ---------------------------------------------------------------
-- サーバー（Cron）だけが呼ぶ関数
-- ---------------------------------------------------------------

-- 毎日の整理と keep-alive
create or replace function public.run_daily_maintenance(p_source text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.app_settings;
  v_deleted_rooms int := 0;
  v_cleaned_rooms int := 0;
  r record;
begin
  select * into s from public.app_settings where id = 1;
  insert into public.heartbeats (source) values (p_source);

  delete from public.attempt_logs where created_at < now() - interval '1 day';
  delete from public.handoff_codes where expires_at < now() - interval '1 day';
  delete from public.invites
  where (revoked_at is not null or expires_at < now()) and created_at < now() - interval '30 days';
  delete from public.heartbeats where created_at < now() - interval '30 days';

  -- 使われていないルームの整理（⭐付きの日は残す）
  for r in
    select id from public.rooms
    where last_activity_at < now() - make_interval(days => s.inactive_cleanup_days)
  loop
    if not exists (select 1 from public.day_stars where room_id = r.id) then
      delete from public.rooms where id = r.id;
      v_deleted_rooms := v_deleted_rooms + 1;
    else
      delete from public.stamps st
      where st.room_id = r.id
        and not exists (select 1 from public.day_stars d where d.room_id = r.id and d.date = st.date);
      delete from public.items i
      where i.room_id = r.id and i.kind = 'once'
        and not exists (select 1 from public.day_stars d where d.room_id = r.id and d.date = i.date);
      delete from public.items i
      where i.room_id = r.id and i.kind <> 'once'
        and not exists (select 1 from public.stamps st where st.item_id = i.id);
      update public.rooms set last_activity_at = now() where id = r.id;
      v_cleaned_rooms := v_cleaned_rooms + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'deleted_rooms', v_deleted_rooms, 'cleaned_rooms', v_cleaned_rooms);
end;
$$;

-- どのルームにも入っていない、30日以上前の匿名ユーザー（サーバーが削除する）
create or replace function public.list_orphan_anonymous_users(p_limit int default 100)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u
  where u.is_anonymous
    and u.created_at < now() - interval '30 days'
    and not exists (select 1 from public.room_members m where m.user_id = u.id)
  limit p_limit
$$;

-- GitHub Actions（予備の keep-alive）用：記録を残し、メインの記録が何時間前かを返す
create or replace function public.keepalive_check(p_source text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last timestamptz;
begin
  insert into public.heartbeats (source) values (p_source);
  select max(created_at) into v_last from public.heartbeats where source = 'vercel-cron';
  return jsonb_build_object(
    'ok', true,
    'hours_since_main', case when v_last is null then null
                             else round(extract(epoch from now() - v_last) / 3600) end);
end;
$$;

-- ---------------------------------------------------------------
-- 呼び出せる人を絞る
-- ---------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.jst_today(),
  public.is_member(uuid),
  public.is_owner(uuid),
  public.item_occurs_on(public.items, date),
  public.items_on(uuid, date),
  public.get_app_info(),
  public.create_room(text, text, text),
  public.join_room(text, text),
  public.regenerate_invite(uuid),
  public.revoke_invites(uuid),
  public.transfer_owner(uuid, uuid),
  public.leave_room(uuid),
  public.remove_member(uuid, uuid),
  public.remove_item(uuid),
  public.expand_template(uuid, date),
  public.issue_restore_token(),
  public.issue_handoff_code(),
  public.redeem_identity(text)
to authenticated;

grant execute on function public.get_app_info(), public.get_invite_info(text) to anon, authenticated;

grant execute on function
  public.run_daily_maintenance(text),
  public.list_orphan_anonymous_users(int),
  public.keepalive_check(text)
to service_role;

-- 今後作る関数も、勝手に誰でも呼べる状態にしない
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
