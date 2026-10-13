-- つなぐメモ：デモ環境（ポートフォリオ用）の仕組み
--
-- 足すもの：
--   - seed_demo_room：デモの見本ルームに、見本の相手と、確認リスト・スタンプ・振り返り・お気に入りを入れる
--   - reset_demo：作ってから一定時間たったデモのルームを消す（毎日のリセット）
--   - list_orphan_anonymous_users：消す対象の「古さ」を指定できるようにし、デモの見本の相手も対象にする
-- どれもサーバー（service_role）だけが呼べる。見本とリセットは、app_settings.is_demo が true の時しか動かない。
-- 本番に入れても、is_demo は false のままなので、見本とリセットは何もしない。

-- ---------------------------------------------------------------
-- デモの見本ルームに、見本のデータを入れる
-- ---------------------------------------------------------------
create or replace function public.seed_demo_room(p_room_id uuid, p_partner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.jst_today();
  v_owner uuid;
  v_memo1 uuid;
  v_memo2 uuid;
  v_e1 uuid;
  v_e2 uuid;
  v_y1 uuid;
  v_y2 uuid;
begin
  if not coalesce((select is_demo from public.app_settings where id = 1), false) then
    return public._fail('not_demo');
  end if;
  select user_id into v_owner from public.room_members where room_id = p_room_id and role = 'owner';
  if v_owner is null then return public._fail('not_found'); end if;
  -- 見本を入れられるのは、作成者ひとりだけのルームに1回だけ
  if (select count(*) from public.room_members where room_id = p_room_id) <> 1 then
    return public._fail('already_seeded');
  end if;

  insert into public.room_members (room_id, user_id, display_name, role, color, emoji)
  values (p_room_id, p_partner_id, '見本の相手', 'member', 2, '🐰');

  select id into v_memo1 from public.memos where room_id = p_room_id order by position limit 1;
  select id into v_memo2 from public.memos where room_id = p_room_id order by position offset 1 limit 1;

  -- 今日の確認リスト：見本の相手だけが☀️を押している（「ほかの人だけ」の見え方が分かる）
  insert into public.day_entries (room_id, date, body, memo_item_id, position, created_by)
  select p_room_id, v_today, i.body, i.id, row_number() over (order by i.position), p_partner_id
  from public.memo_items i where i.memo_id = v_memo2 and i.position in (1, 3);
  insert into public.day_entries (room_id, date, body, memo_item_id, position, created_by)
  select p_room_id, v_today, i.body, i.id, 3, p_partner_id
  from public.memo_items i where i.memo_id = v_memo1 and i.position = 3;
  select id into v_e1 from public.day_entries where room_id = p_room_id and date = v_today order by position limit 1;
  select id into v_e2 from public.day_entries where room_id = p_room_id and date = v_today order by position offset 1 limit 1;
  insert into public.checks (entry_id, slot, user_id, room_id, date) values
    (v_e1, 'morning', p_partner_id, p_room_id, v_today),
    (v_e2, 'morning', p_partner_id, p_room_id, v_today);

  -- 昨日：2人とも押した記録と、見本の相手の振り返り。お気に入りにしてある
  insert into public.day_entries (room_id, date, body, memo_item_id, position, created_by)
  select p_room_id, v_today - 1, i.body, i.id, row_number() over (order by i.position), p_partner_id
  from public.memo_items i where i.memo_id = v_memo2 and i.position in (1, 2);
  select id into v_y1 from public.day_entries where room_id = p_room_id and date = v_today - 1 order by position limit 1;
  select id into v_y2 from public.day_entries where room_id = p_room_id and date = v_today - 1 order by position offset 1 limit 1;
  insert into public.checks (entry_id, slot, user_id, room_id, date) values
    (v_y1, 'morning', p_partner_id, p_room_id, v_today - 1),
    (v_y1, 'morning', v_owner, p_room_id, v_today - 1),
    (v_y1, 'night', p_partner_id, p_room_id, v_today - 1),
    (v_y2, 'night', v_owner, p_room_id, v_today - 1);
  insert into public.reflections (room_id, date, author_id, body)
  values (p_room_id, v_today - 1, p_partner_id,
    E'【大事にしたかったこと】\n予定が変わった時に、分かった時点で短く伝えること。\n\n【できたこと】\n移動の前に、連絡できそうな時間を先に伝えられた。\n\n【改善を実感したこと】\n先に伝えておくと、あとで説明する時も落ち着いて話せた。');
  insert into public.day_stars (room_id, date, starred_by) values (p_room_id, v_today - 1, p_partner_id);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------
-- デモの毎日のリセット：作ってから p_hours 時間たったルームを消す
-- ---------------------------------------------------------------
create or replace function public.reset_demo(p_hours int default 24)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  if not coalesce((select is_demo from public.app_settings where id = 1), false) then
    return public._fail('not_demo');
  end if;
  delete from public.rooms where created_at < now() - make_interval(hours => p_hours);
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('ok', true, 'deleted_rooms', v_deleted);
end;
$$;

-- ---------------------------------------------------------------
-- どのルームにも入っていないユーザー（サーバーが削除する）
--   匿名ユーザーと、デモの見本の相手（目印つき）が対象。p_min_age_hours より古いものだけ
-- ---------------------------------------------------------------
drop function if exists public.list_orphan_anonymous_users(int);
create or replace function public.list_orphan_anonymous_users(p_limit int default 100, p_min_age_hours int default 720)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u
  where (u.is_anonymous or coalesce(u.raw_user_meta_data ->> 'demo_partner', '') = 'true')
    and u.created_at < now() - make_interval(hours => p_min_age_hours)
    and not exists (select 1 from public.room_members m where m.user_id = u.id)
  limit p_limit
$$;

-- サーバーだけが呼べるようにする
revoke execute on function public.seed_demo_room(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.reset_demo(int) from public, anon, authenticated;
revoke execute on function public.list_orphan_anonymous_users(int, int) from public, anon, authenticated;
grant execute on function
  public.seed_demo_room(uuid, uuid),
  public.reset_demo(int),
  public.list_orphan_anonymous_users(int, int)
to service_role;
