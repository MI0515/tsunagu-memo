-- つなぐメモ：Row Level Security（他のルームのデータを読めなくする鍵）
-- 方針：ルームのメンバーだけが、そのルームのデータを読み書きできる。
--       招待参加・オーナー変更などの重要な操作は、DB関数（次のファイル）経由でだけ行う。

create or replace function public.is_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid()
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
    where room_id = p_room_id and user_id = auth.uid() and role = 'owner'
  )
$$;

alter table public.app_settings enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.invites enable row level security;
alter table public.items enable row level security;
alter table public.stamps enable row level security;
alter table public.day_stars enable row level security;
alter table public.templates enable row level security;
alter table public.template_items enable row level security;
alter table public.template_expansions enable row level security;
alter table public.phrases enable row level security;
alter table public.restore_tokens enable row level security;
alter table public.handoff_codes enable row level security;
alter table public.attempt_logs enable row level security;
alter table public.heartbeats enable row level security;
-- app_settings / restore_tokens / handoff_codes / attempt_logs / heartbeats は
-- ポリシーなし＝アプリからは直接読めない（DB関数とサーバーだけが使う）

-- ログインしていない人（anon）には、表を一切触らせない
revoke all on all tables in schema public from anon;

-- ログイン済みの人に許す操作を、表ごとに明示する。
-- Supabaseの「新しいテーブルを自動的に公開する」がON・OFFどちらでも同じ権限になるよう、
-- まず全部取り消してから、必要なものだけ許可する。
revoke all on all tables in schema public from authenticated;
grant select on public.rooms, public.room_members, public.invites, public.template_expansions
  to authenticated;
grant select, insert on public.items to authenticated;
grant select, insert, delete on public.stamps, public.day_stars, public.templates,
  public.template_items, public.phrases
  to authenticated;
-- 更新できる列は、このあと表ごとに個別に許可する

-- rooms
create policy "メンバーはルームを見られる" on public.rooms
  for select to authenticated using (public.is_member(id));
create policy "オーナーはルーム名を変えられる" on public.rooms
  for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));
revoke insert, delete, update on public.rooms from authenticated;
grant update (name) on public.rooms to authenticated;

-- room_members
create policy "メンバーは同じルームのメンバーを見られる" on public.room_members
  for select to authenticated using (public.is_member(room_id));
create policy "自分の表示名だけ変えられる" on public.room_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete, update on public.room_members from authenticated;
grant update (display_name) on public.room_members to authenticated;

-- invites（オーナーだけが見られる。作成・無効化は関数で）
create policy "オーナーは招待リンクを見られる" on public.invites
  for select to authenticated using (public.is_owner(room_id));
revoke insert, delete, update on public.invites from authenticated;

-- items（削除は remove_item 関数で。繰り返し項目の記録を残すため）
create policy "メンバーは項目を見られる" on public.items
  for select to authenticated using (public.is_member(room_id));
create policy "メンバーは項目を追加できる" on public.items
  for insert to authenticated with check (public.is_member(room_id) and created_by = auth.uid());
create policy "メンバーは項目を編集できる" on public.items
  for update to authenticated using (public.is_member(room_id)) with check (public.is_member(room_id));
revoke delete, update on public.items from authenticated;
grant update (title, position, weekdays, month_day) on public.items to authenticated;

-- stamps（自分のスタンプだけ押せる・消せる）
create policy "メンバーはスタンプを見られる" on public.stamps
  for select to authenticated using (public.is_member(room_id));
create policy "自分のスタンプを押せる" on public.stamps
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.is_member(room_id)
    and exists (select 1 from public.items i where i.id = item_id and i.room_id = stamps.room_id)
  );
create policy "自分のスタンプを取り消せる" on public.stamps
  for delete to authenticated using (user_id = auth.uid());
revoke update on public.stamps from authenticated;

-- day_stars
create policy "メンバーは⭐を見られる" on public.day_stars
  for select to authenticated using (public.is_member(room_id));
create policy "メンバーは⭐を付けられる" on public.day_stars
  for insert to authenticated with check (public.is_member(room_id) and starred_by = auth.uid());
create policy "メンバーは⭐を外せる" on public.day_stars
  for delete to authenticated using (public.is_member(room_id));
revoke update on public.day_stars from authenticated;

-- templates / template_items / phrases（メンバーなら編集できる）
create policy "メンバーはテンプレを見られる" on public.templates
  for select to authenticated using (public.is_member(room_id));
create policy "メンバーはテンプレを追加できる" on public.templates
  for insert to authenticated with check (public.is_member(room_id));
create policy "メンバーはテンプレを編集できる" on public.templates
  for update to authenticated using (public.is_member(room_id)) with check (public.is_member(room_id));
create policy "メンバーはテンプレを削除できる" on public.templates
  for delete to authenticated using (public.is_member(room_id));

create policy "メンバーはテンプレ項目を見られる" on public.template_items
  for select to authenticated using (public.is_member(room_id));
create policy "メンバーはテンプレ項目を追加できる" on public.template_items
  for insert to authenticated with check (
    public.is_member(room_id)
    and exists (select 1 from public.templates t where t.id = template_id and t.room_id = template_items.room_id)
  );
create policy "メンバーはテンプレ項目を編集できる" on public.template_items
  for update to authenticated using (public.is_member(room_id)) with check (public.is_member(room_id));
create policy "メンバーはテンプレ項目を削除できる" on public.template_items
  for delete to authenticated using (public.is_member(room_id));
revoke update on public.template_items from authenticated;
grant update (title, position) on public.template_items to authenticated;
revoke update on public.templates from authenticated;
grant update (name, position) on public.templates to authenticated;

create policy "メンバーは展開済みかを見られる" on public.template_expansions
  for select to authenticated using (public.is_member(room_id));
revoke insert, update, delete on public.template_expansions from authenticated;

create policy "メンバーは定型文を見られる" on public.phrases
  for select to authenticated using (public.is_member(room_id));
create policy "メンバーは定型文を追加できる" on public.phrases
  for insert to authenticated with check (public.is_member(room_id));
create policy "メンバーは定型文を編集できる" on public.phrases
  for update to authenticated using (public.is_member(room_id)) with check (public.is_member(room_id));
create policy "メンバーは定型文を削除できる" on public.phrases
  for delete to authenticated using (public.is_member(room_id));
revoke update on public.phrases from authenticated;
grant update (body, position) on public.phrases to authenticated;

-- 中身を守る表は、ログイン済みの人にも直接触らせない
revoke all on public.app_settings, public.restore_tokens, public.handoff_codes,
  public.attempt_logs, public.heartbeats from authenticated;

-- リアルタイム同期の対象
alter publication supabase_realtime add table
  public.items, public.stamps, public.day_stars, public.room_members,
  public.templates, public.template_items, public.template_expansions, public.phrases, public.rooms;
