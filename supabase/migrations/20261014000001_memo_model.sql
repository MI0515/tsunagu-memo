-- つなぐメモ：新しい考え方（メモ → 選ぶ → 確認リスト☀️🌙 → 振り返り）への移行
--
-- 消えるもの：items / stamps / templates / template_items / template_expansions / phrases
--   （その場で作る項目・👀🙏💙のスタンプ・テンプレ・定型文の仕組み）
-- 残るもの：ルーム・メンバー・招待リンク・⭐・引き継ぎの仕組み

-- ===============================================================
-- 1. 古い仕組みを片づける
-- ===============================================================
drop function if exists public.items_on(uuid, date);
drop function if exists public.item_occurs_on(public.items, date);
drop function if exists public.remove_item(uuid);
drop function if exists public.expand_template(uuid, date);

drop table public.stamps;
drop table public.template_expansions;
drop table public.template_items;
drop table public.items;
drop table public.templates;
drop table public.phrases;

drop function if exists public._limit_items();
drop function if exists public._limit_children();

-- ===============================================================
-- 2. メンバー：色・絵文字・退出
-- ===============================================================
alter table public.room_members
  add column color smallint check (color between 1 and 6),
  add column emoji text check (char_length(emoji) between 1 and 8),
  add column left_at timestamptz;

-- 今いるメンバーに、参加順で色と絵文字を割り当てる
with ordered as (
  select room_id, user_id, row_number() over (partition by room_id order by joined_at) as n
  from public.room_members
)
update public.room_members m
set color = least(o.n, 6)::smallint,
    emoji = (array['🐻','🐰','🐱','🐶','🐼','🦊'])[least(o.n, 6)]
from ordered o
where o.room_id = m.room_id and o.user_id = m.user_id;

-- 在籍中のメンバーは必ず色を持ち、同じルームで色が重ならない
alter table public.room_members
  add constraint room_members_active_has_look
  check (left_at is not null or (color is not null and emoji is not null));
create unique index room_members_unique_color
  on public.room_members (room_id, color) where left_at is null;

-- 最大人数を6人に
update public.rooms set member_limit = least(member_limit, 6);
alter table public.rooms drop constraint rooms_member_limit_check;
alter table public.rooms alter column member_limit set default 6;
alter table public.rooms add constraint rooms_member_limit_check check (member_limit between 2 and 6);
alter table public.app_settings alter column max_members_per_room set default 6;
update public.app_settings set max_members_per_room = least(max_members_per_room, 6);

-- 退出した人は「メンバー」として扱わない
create or replace function public.is_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid() and left_at is null
  )
$$;

create or replace function public.is_owner(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid() and role = 'owner' and left_at is null
  )
$$;

drop policy "自分の表示名だけ変えられる" on public.room_members;
create policy "自分の表示名だけ変えられる" on public.room_members
  for update to authenticated
  using (user_id = auth.uid() and left_at is null)
  with check (user_id = auth.uid() and left_at is null);

-- ===============================================================
-- 3. 新しい表
-- ===============================================================
create table public.memos (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 30),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.memos (room_id);

create table public.memo_items (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid not null references public.memos (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 80),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.memo_items (memo_id);

-- 名前を付けて保存した選択セット
create table public.selection_sets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.selection_sets (room_id);

create table public.selection_set_items (
  set_id uuid not null references public.selection_sets (id) on delete cascade,
  memo_item_id uuid not null references public.memo_items (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  primary key (set_id, memo_item_id)
);

-- その日の確認リストの項目（追加した時点の文を控えとして持つ）
create table public.day_entries (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  date date not null,
  body text not null check (char_length(body) between 1 and 80),
  memo_item_id uuid references public.memo_items (id) on delete set null,
  position int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.day_entries (room_id, date);
-- 同じ日に同じメモ項目は1つだけ
create unique index day_entries_unique_memo_item
  on public.day_entries (room_id, date, memo_item_id) where memo_item_id is not null;

-- ☀️朝・🌙夜のチェック（項目 × 朝夜 × 人）
create table public.checks (
  entry_id uuid not null references public.day_entries (id) on delete cascade,
  slot text not null check (slot in ('morning', 'night')),
  user_id uuid not null references auth.users (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  primary key (entry_id, slot, user_id)
);
create index on public.checks (room_id, date);

-- 振り返り（1日1人1つ）と追記
create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  date date not null,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, date, author_id)
);

create table public.reflection_notes (
  id uuid primary key default gen_random_uuid(),
  reflection_id uuid not null references public.reflections (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.reflection_notes (reflection_id);

-- ===============================================================
-- 4. 鍵（RLS）と、許す操作
-- ===============================================================
alter table public.memos enable row level security;
alter table public.memo_items enable row level security;
alter table public.selection_sets enable row level security;
alter table public.selection_set_items enable row level security;
alter table public.day_entries enable row level security;
alter table public.checks enable row level security;
alter table public.reflections enable row level security;
alter table public.reflection_notes enable row level security;

revoke all on public.memos, public.memo_items, public.selection_sets, public.selection_set_items,
  public.day_entries, public.checks, public.reflections, public.reflection_notes
  from anon, authenticated;

grant select, insert, delete on public.memos, public.memo_items, public.selection_sets,
  public.selection_set_items, public.day_entries, public.checks, public.reflections,
  public.reflection_notes
  to authenticated;
grant update (title) on public.memos to authenticated;
grant update (body) on public.memo_items to authenticated;
grant update (name) on public.selection_sets to authenticated;
grant update (body) on public.day_entries to authenticated;
grant update (body) on public.reflections to authenticated;
grant update (body) on public.reflection_notes to authenticated;

-- メモ：メンバーなら読み書きできる
create policy "メンバーはメモを見られる" on public.memos
  for select to authenticated using (public.is_member(room_id));
create policy "メンバーはメモを作れる" on public.memos
  for insert to authenticated with check (public.is_member(room_id));
create policy "メンバーはメモを直せる" on public.memos
  for update to authenticated using (public.is_member(room_id)) with check (public.is_member(room_id));
create policy "メンバーはメモを消せる" on public.memos
  for delete to authenticated using (public.is_member(room_id));

create policy "メンバーはメモの項目を見られる" on public.memo_items
  for select to authenticated using (public.is_member(room_id));
create policy "メンバーはメモの項目を足せる" on public.memo_items
  for insert to authenticated with check (
    public.is_member(room_id)
    and exists (select 1 from public.memos m where m.id = memo_id and m.room_id = memo_items.room_id)
  );
create policy "メンバーはメモの項目を直せる" on public.memo_items
  for update to authenticated using (public.is_member(room_id)) with check (public.is_member(room_id));
create policy "メンバーはメモの項目を消せる" on public.memo_items
  for delete to authenticated using (public.is_member(room_id));

create policy "メンバーはセットを見られる" on public.selection_sets
  for select to authenticated using (public.is_member(room_id));
create policy "メンバーはセットを作れる" on public.selection_sets
  for insert to authenticated with check (public.is_member(room_id) and created_by = auth.uid());
create policy "メンバーはセットの名前を直せる" on public.selection_sets
  for update to authenticated using (public.is_member(room_id)) with check (public.is_member(room_id));
create policy "メンバーはセットを消せる" on public.selection_sets
  for delete to authenticated using (public.is_member(room_id));

create policy "メンバーはセットの中身を見られる" on public.selection_set_items
  for select to authenticated using (public.is_member(room_id));
create policy "メンバーはセットに項目を入れられる" on public.selection_set_items
  for insert to authenticated with check (
    public.is_member(room_id)
    and exists (select 1 from public.selection_sets s where s.id = set_id and s.room_id = selection_set_items.room_id)
    and exists (select 1 from public.memo_items i where i.id = memo_item_id and i.room_id = selection_set_items.room_id)
  );
create policy "メンバーはセットから項目を外せる" on public.selection_set_items
  for delete to authenticated using (public.is_member(room_id));

-- 確認リスト：メモから選ぶ時は add_to_day 関数。「その日だけの項目」は今日・明日にだけ直接足せる
create policy "メンバーは確認リストを見られる" on public.day_entries
  for select to authenticated using (public.is_member(room_id));
create policy "メンバーはその日だけの項目を足せる" on public.day_entries
  for insert to authenticated with check (
    public.is_member(room_id)
    and created_by = auth.uid()
    and memo_item_id is null
    and date between public.jst_today() and public.jst_today() + 1
  );
create policy "メンバーは確認リストの文を直せる" on public.day_entries
  for update to authenticated using (public.is_member(room_id)) with check (public.is_member(room_id));
create policy "メンバーは確認リストの項目を消せる" on public.day_entries
  for delete to authenticated using (public.is_member(room_id));

-- チェック：自分の分だけ押せる・取り消せる
create policy "メンバーはチェックを見られる" on public.checks
  for select to authenticated using (public.is_member(room_id));
create policy "自分のチェックを入れられる" on public.checks
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.is_member(room_id)
    and exists (select 1 from public.day_entries e
                where e.id = entry_id and e.room_id = checks.room_id and e.date = checks.date)
  );
create policy "自分のチェックを取り消せる" on public.checks
  for delete to authenticated using (user_id = auth.uid());

-- 振り返り：みんな読める。書く・直す・消すのは本人だけ
create policy "メンバーは振り返りを読める" on public.reflections
  for select to authenticated using (public.is_member(room_id));
create policy "自分の振り返りを書ける" on public.reflections
  for insert to authenticated with check (author_id = auth.uid() and public.is_member(room_id));
create policy "自分の振り返りを直せる" on public.reflections
  for update to authenticated
  using (author_id = auth.uid() and public.is_member(room_id))
  with check (author_id = auth.uid() and public.is_member(room_id));
create policy "自分の振り返りを消せる" on public.reflections
  for delete to authenticated using (author_id = auth.uid() and public.is_member(room_id));

create policy "メンバーは追記を読める" on public.reflection_notes
  for select to authenticated using (public.is_member(room_id));
create policy "メンバーは追記を書ける" on public.reflection_notes
  for insert to authenticated with check (
    author_id = auth.uid()
    and public.is_member(room_id)
    and exists (select 1 from public.reflections r where r.id = reflection_id and r.room_id = reflection_notes.room_id)
  );
create policy "自分の追記を直せる" on public.reflection_notes
  for update to authenticated
  using (author_id = auth.uid() and public.is_member(room_id))
  with check (author_id = auth.uid() and public.is_member(room_id));
create policy "自分の追記を消せる" on public.reflection_notes
  for delete to authenticated using (author_id = auth.uid() and public.is_member(room_id));

-- リアルタイム同期の対象
alter publication supabase_realtime add table
  public.memos, public.memo_items, public.day_entries, public.checks,
  public.reflections, public.reflection_notes;

-- ===============================================================
-- 5. 自動で動く処理（トリガー）
-- ===============================================================
create or replace function public._set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger reflections_updated_at before update on public.reflections
  for each row execute function public._set_updated_at();
create trigger reflection_notes_updated_at before update on public.reflection_notes
  for each row execute function public._set_updated_at();

-- 並び順の指定がない項目（その日だけの項目など）は、その日の一番下に入れる
create or replace function public._entry_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.position, 0) = 0 then
    select coalesce(max(position), 0) + 1 into new.position
    from public.day_entries where room_id = new.room_id and date = new.date;
  end if;
  return new;
end;
$$;

create trigger day_entries_position before insert on public.day_entries
  for each row execute function public._entry_position();

-- 記録があったらルームの「最後に使われた日時」を更新
create trigger touch_room_on_entry after insert on public.day_entries
  for each row execute function public._touch_room();
create trigger touch_room_on_check after insert on public.checks
  for each row execute function public._touch_room();
create trigger touch_room_on_reflection after insert on public.reflections
  for each row execute function public._touch_room();
create trigger touch_room_on_note after insert on public.reflection_notes
  for each row execute function public._touch_room();

-- 数の上限（荒らし対策）
create or replace function public._limit_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_max int := tg_argv[0]::int;
begin
  case tg_table_name
    when 'memos' then
      select count(*) into v_count from public.memos where room_id = new.room_id;
    when 'memo_items' then
      select count(*) into v_count from public.memo_items where memo_id = new.memo_id;
    when 'selection_sets' then
      select count(*) into v_count from public.selection_sets where room_id = new.room_id;
    when 'day_entries' then
      select count(*) into v_count from public.day_entries where room_id = new.room_id and date = new.date;
    when 'reflection_notes' then
      select count(*) into v_count from public.reflection_notes where reflection_id = new.reflection_id;
  end case;
  if v_count >= v_max then
    raise exception 'limit_reached' using hint = 'これ以上追加できません';
  end if;
  return new;
end;
$$;

create trigger limit_memos before insert on public.memos
  for each row execute function public._limit_rows('10');
create trigger limit_memo_items before insert on public.memo_items
  for each row execute function public._limit_rows('30');
create trigger limit_selection_sets before insert on public.selection_sets
  for each row execute function public._limit_rows('10');
create trigger limit_day_entries before insert on public.day_entries
  for each row execute function public._limit_rows('50');
create trigger limit_reflection_notes before insert on public.reflection_notes
  for each row execute function public._limit_rows('100');

-- ===============================================================
-- 6. DB関数
-- ===============================================================

-- 初期メモを入れる
create or replace function public._seed_memos(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memo uuid;
begin
  insert into public.memos (room_id, title, position) values (p_room_id, '普段と違う予定の日', 1)
  returning id into v_memo;
  insert into public.memo_items (memo_id, room_id, body, position)
  select v_memo, p_room_id, t.body, t.pos
  from (values
    (1, '事前に、連絡が難しくなりそうな時間帯と、連絡できそうなタイミングを共有する'),
    (2, '朝（起きた時）にメモを確認する'),
    (3, '長く連絡が途絶えたあとは、詳しい説明より先に「無事であること」と「今の状況」を短く伝える'),
    (4, '相手の反応が気になって考え込みそうな時は、「気になることがあるので、落ち着いてからちゃんと話したい」とだけ先に送る'),
    (5, '夜（寝る前）にメモを確認し、できたか振り返る')
  ) as t (pos, body);

  insert into public.memos (room_id, title, position) values (p_room_id, '送る言葉', 2)
  returning id into v_memo;
  insert into public.memo_items (memo_id, room_id, body, position)
  select v_memo, p_room_id, t.body, t.pos
  from (values
    (1, '無事です。今は○○にいます。'),
    (2, '気になることがあるので、落ち着いてからちゃんと話したい。'),
    (3, '今は詳しく説明できないので、あとで改めて説明します。')
  ) as t (pos, body);
end;
$$;

-- 初期メモがない既存のルームに入れる
do $$
declare r record;
begin
  for r in select id from public.rooms where not exists (select 1 from public.memos m where m.room_id = rooms.id) loop
    perform public._seed_memos(r.id);
  end loop;
end $$;

-- 空いている一番小さい色と、その色の絵文字
create or replace function public._free_color(p_room_id uuid)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select min(c)::smallint from generate_series(1, 6) as c
  where not exists (
    select 1 from public.room_members
    where room_id = p_room_id and color = c and left_at is null)
$$;

create or replace function public._default_emoji(p_color smallint)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['🐻','🐰','🐱','🐶','🐼','🦊'])[p_color]
$$;

-- ルーム作成（作成用コード・上限をチェックし、初期メモも入れる）
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
  values (trim(p_name), v_uid, least(s.max_members_per_room, 6))
  returning id into v_room_id;

  insert into public.room_members (room_id, user_id, display_name, role, color, emoji)
  values (v_room_id, v_uid, trim(p_display_name), 'owner', 1, public._default_emoji(1::smallint));

  perform public._seed_memos(v_room_id);

  insert into public.invites (room_id, token, created_by)
  values (v_room_id, public._random_token(24), v_uid);

  return jsonb_build_object('ok', true, 'room_id', v_room_id);
end;
$$;

-- 招待リンクで参加（以前退出した人は、もう一度メンバーに戻る）
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
  v_color smallint;
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

  if exists (select 1 from public.room_members
             where room_id = v_invite.room_id and user_id = v_uid and left_at is null) then
    return jsonb_build_object('ok', true, 'room_id', v_invite.room_id);
  end if;

  -- 同時に参加しても人数と色がずれないよう、ルームを押さえてから数える
  select member_limit into v_limit from public.rooms where id = v_invite.room_id for update;
  if (select count(*) from public.room_members
      where room_id = v_invite.room_id and left_at is null) >= v_limit then
    return public._fail('room_full');
  end if;
  v_color := public._free_color(v_invite.room_id);
  if v_color is null then return public._fail('room_full'); end if;

  insert into public.room_members (room_id, user_id, display_name, role, color, emoji)
  values (v_invite.room_id, v_uid, trim(p_display_name), 'member', v_color, public._default_emoji(v_color))
  on conflict (room_id, user_id) do update
    set display_name = excluded.display_name, role = 'member', color = excluded.color,
        emoji = excluded.emoji, left_at = null, joined_at = now();

  return jsonb_build_object('ok', true, 'room_id', v_invite.room_id);
end;
$$;

-- 自分の色と絵文字を変える（同じルームで色が重なる時は断る）
create or replace function public.set_member_look(p_room_id uuid, p_color smallint, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member(p_room_id) then return public._fail('not_member'); end if;
  if p_color not between 1 and 6 or char_length(coalesce(p_emoji, '')) not between 1 and 8 then
    return public._fail('bad_look');
  end if;
  if exists (select 1 from public.room_members
             where room_id = p_room_id and color = p_color and left_at is null and user_id <> auth.uid()) then
    return public._fail('color_taken');
  end if;
  update public.room_members set color = p_color, emoji = p_emoji
  where room_id = p_room_id and user_id = auth.uid();
  return jsonb_build_object('ok', true);
end;
$$;

-- オーナーを譲る（相手は在籍中のメンバー）
create or replace function public.transfer_owner(p_room_id uuid, p_new_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner(p_room_id) then return public._fail('not_owner'); end if;
  if not exists (select 1 from public.room_members
                 where room_id = p_room_id and user_id = p_new_owner and left_at is null) then
    return public._fail('not_member');
  end if;
  update public.room_members set role = 'member' where room_id = p_room_id and user_id = auth.uid();
  update public.room_members set role = 'owner' where room_id = p_room_id and user_id = p_new_owner;
  return jsonb_build_object('ok', true);
end;
$$;

-- 退出したことにする（記録は残し、名前は「退出したメンバー」に）
create or replace function public._mark_left(p_room_id uuid, p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.room_members
  set left_at = now(), display_name = '退出したメンバー', role = 'member', color = null
  where room_id = p_room_id and user_id = p_user_id
$$;

-- ルームから退出：mode = 'keep'（記録を残す）か 'erase'（自分の分を全部削除）
drop function if exists public.leave_room(uuid);
create or replace function public.leave_room(p_room_id uuid, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.is_member(p_room_id) then return public._fail('not_member'); end if;
  if p_mode not in ('keep', 'erase') then return public._fail('bad_mode'); end if;

  if public.is_owner(p_room_id) then
    if exists (select 1 from public.room_members
               where room_id = p_room_id and user_id <> v_uid and left_at is null) then
      return public._fail('transfer_first');
    end if;
    delete from public.rooms where id = p_room_id;
    return jsonb_build_object('ok', true, 'room_deleted', true);
  end if;

  if p_mode = 'erase' then
    delete from public.checks where room_id = p_room_id and user_id = v_uid;
    delete from public.reflection_notes where room_id = p_room_id and author_id = v_uid;
    delete from public.reflections where room_id = p_room_id and author_id = v_uid;
    delete from public.room_members where room_id = p_room_id and user_id = v_uid;
  else
    perform public._mark_left(p_room_id, v_uid);
  end if;
  return jsonb_build_object('ok', true, 'room_deleted', false);
end;
$$;

-- メンバーを外す（オーナーのみ。外された人の記録は残す）
create or replace function public.remove_member(p_room_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner(p_room_id) then return public._fail('not_owner'); end if;
  if p_user_id = auth.uid() then return public._fail('cannot_remove_self'); end if;
  perform public._mark_left(p_room_id, p_user_id);
  return jsonb_build_object('ok', true);
end;
$$;

-- ルームの削除（オーナーのみ。ルーム名が一致した時だけ）
create or replace function public.delete_room(p_room_id uuid, p_confirm_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner(p_room_id) then return public._fail('not_owner'); end if;
  if not exists (select 1 from public.rooms where id = p_room_id and name = trim(coalesce(p_confirm_name, ''))) then
    return public._fail('name_mismatch');
  end if;
  delete from public.rooms where id = p_room_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- 選んだメモ項目を、今日か明日の確認リストに入れる（すでにある項目は飛ばす）
create or replace function public.add_to_day(p_room_id uuid, p_date date, p_memo_item_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next int;
  v_added int;
begin
  if not public.is_member(p_room_id) then return public._fail('not_member'); end if;
  if p_date not in (public.jst_today(), public.jst_today() + 1) then return public._fail('bad_date'); end if;
  if coalesce(cardinality(p_memo_item_ids), 0) = 0 then return public._fail('nothing_selected'); end if;

  select coalesce(max(position), 0) into v_next
  from public.day_entries where room_id = p_room_id and date = p_date;

  insert into public.day_entries (room_id, date, body, memo_item_id, position, created_by)
  select p_room_id, p_date, i.body, i.id,
         v_next + row_number() over (order by m.position, m.created_at, i.position, i.created_at),
         auth.uid()
  from public.memo_items i
  join public.memos m on m.id = i.memo_id
  where i.room_id = p_room_id and i.id = any (p_memo_item_ids)
  on conflict (room_id, date, memo_item_id) where memo_item_id is not null do nothing;
  get diagnostics v_added = row_count;

  return jsonb_build_object('ok', true, 'added', v_added,
    'skipped', cardinality(p_memo_item_ids) - v_added);
end;
$$;

-- 前回選んだメモ項目（メモから選んだ一番新しい日の分。消えた項目は除く）
create or replace function public.last_selection(p_room_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(e.memo_item_id), '{}')
  from public.day_entries e
  join public.memo_items i on i.id = e.memo_item_id
  where public.is_member(p_room_id)
    and e.room_id = p_room_id
    and e.date = (
      select max(date) from public.day_entries
      where room_id = p_room_id and memo_item_id is not null and date <= public.jst_today() + 1)
$$;

-- 日ごとのまとめ（⭐一覧・過去の記録の一覧用）
create or replace function public.day_summaries(
  p_room_id uuid, p_from date default null, p_to date default null, p_starred_only boolean default false)
returns table (
  date date, entry_count int, check_count int, reflection_authors uuid[], starred boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select e.date from public.day_entries e where e.room_id = p_room_id
    union select r.date from public.reflections r where r.room_id = p_room_id
    union select s.date from public.day_stars s where s.room_id = p_room_id
  )
  select d.date,
    (select count(*)::int from public.day_entries e where e.room_id = p_room_id and e.date = d.date),
    (select count(*)::int from public.checks c where c.room_id = p_room_id and c.date = d.date),
    (select coalesce(array_agg(r.author_id order by r.created_at), '{}')
       from public.reflections r where r.room_id = p_room_id and r.date = d.date),
    exists (select 1 from public.day_stars s where s.room_id = p_room_id and s.date = d.date)
  from days d
  where public.is_member(p_room_id)
    and (p_from is null or d.date >= p_from)
    and (p_to is null or d.date <= p_to)
    and (not p_starred_only or exists (select 1 from public.day_stars s where s.room_id = p_room_id and s.date = d.date))
  order by d.date desc
$$;

-- 引き継ぎ（復元リンク・引き継ぎコード）：新しい表に合わせて移し替える
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

  -- 同じルームに両方いる時：古い方が退出済みで、今の端末が在籍中なら、今の端末を残す
  delete from public.room_members om
  where om.user_id = v_old and om.left_at is not null
    and exists (select 1 from public.room_members nm
                where nm.room_id = om.room_id and nm.user_id = v_new and nm.left_at is null);
  -- それ以外は古い方（＝本人の履歴）を残す。今の端末側がオーナーなら引き継ぐ
  select coalesce(array_agg(nm.room_id), '{}') into v_owner_rooms
  from public.room_members nm
  where nm.user_id = v_new and nm.role = 'owner'
    and exists (select 1 from public.room_members om where om.room_id = nm.room_id and om.user_id = v_old);
  delete from public.room_members nm
  where nm.user_id = v_new
    and exists (select 1 from public.room_members om where om.room_id = nm.room_id and om.user_id = v_old);
  update public.room_members set role = 'owner' where user_id = v_old and room_id = any (v_owner_rooms);
  update public.room_members set user_id = v_new where user_id = v_old;

  delete from public.checks nc
  where nc.user_id = v_new
    and exists (select 1 from public.checks oc
                where oc.user_id = v_old and oc.entry_id = nc.entry_id and oc.slot = nc.slot);
  update public.checks set user_id = v_new where user_id = v_old;

  delete from public.reflections nr
  where nr.author_id = v_new
    and exists (select 1 from public.reflections r
                where r.author_id = v_old and r.room_id = nr.room_id and r.date = nr.date);
  update public.reflections set author_id = v_new where author_id = v_old;
  update public.reflection_notes set author_id = v_new where author_id = v_old;

  update public.rooms set created_by = v_new where created_by = v_old;
  update public.day_entries set created_by = v_new where created_by = v_old;
  update public.selection_sets set created_by = v_new where created_by = v_old;
  update public.day_stars set starred_by = v_new where starred_by = v_old;
  update public.invites set created_by = v_new where created_by = v_old;

  delete from public.restore_tokens where user_id = v_new
    and exists (select 1 from public.restore_tokens where user_id = v_old);
  update public.restore_tokens set user_id = v_new where user_id = v_old;
  delete from public.handoff_codes where user_id = v_old;

  return jsonb_build_object('ok', true);
end;
$$;

-- 毎日の整理と keep-alive（新しい表に合わせる）
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
      delete from public.day_entries e
      where e.room_id = r.id
        and not exists (select 1 from public.day_stars d where d.room_id = r.id and d.date = e.date);
      delete from public.reflections f
      where f.room_id = r.id
        and not exists (select 1 from public.day_stars d where d.room_id = r.id and d.date = f.date);
      update public.rooms set last_activity_at = now() where id = r.id;
      v_cleaned_rooms := v_cleaned_rooms + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'deleted_rooms', v_deleted_rooms, 'cleaned_rooms', v_cleaned_rooms);
end;
$$;

-- どのルームにも入っていない、30日以上前の匿名ユーザー（退出して記録を残した人は対象外）
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

-- ===============================================================
-- 7. 呼び出せる人を絞る
-- ===============================================================
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.jst_today(),
  public.is_member(uuid),
  public.is_owner(uuid),
  public.get_app_info(),
  public.create_room(text, text, text),
  public.join_room(text, text),
  public.regenerate_invite(uuid),
  public.revoke_invites(uuid),
  public.transfer_owner(uuid, uuid),
  public.leave_room(uuid, text),
  public.remove_member(uuid, uuid),
  public.delete_room(uuid, text),
  public.set_member_look(uuid, smallint, text),
  public.add_to_day(uuid, date, uuid[]),
  public.last_selection(uuid),
  public.day_summaries(uuid, date, date, boolean),
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
