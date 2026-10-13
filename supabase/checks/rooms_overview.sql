-- ルームごとの中身の数を一覧にする（読むだけで、何も変更しません）
-- ルームを整理（削除）する前に、何が消えるかを確かめるために使う。

select
  r.name as ルーム,
  to_char(r.created_at at time zone 'Asia/Tokyo', 'MM/DD HH24:MI') as 作成日時,
  (select string_agg(m.display_name || case when m.role = 'owner' then '（作成者）' else '' end, '、' order by m.joined_at)
     from public.room_members m where m.room_id = r.id and m.left_at is null) as メンバー,
  (select count(*) from public.room_members m where m.room_id = r.id and m.left_at is not null) as 退出した人,
  (select count(*) from public.memos x where x.room_id = r.id) as メモ,
  (select string_agg(x.title, '／' order by x.position) from public.memos x where x.room_id = r.id) as メモの見出し,
  (select count(*) from public.day_entries x where x.room_id = r.id) as 確認リスト,
  (select count(*) from public.checks x where x.room_id = r.id) as スタンプ,
  (select count(*) from public.reflections x where x.room_id = r.id) as 振り返り,
  (select count(*) from public.reflection_notes x where x.room_id = r.id) as 追記,
  (select count(*) from public.day_stars x where x.room_id = r.id) as お気に入り,
  (select count(*) from public.invites x where x.room_id = r.id) as 招待リンク
from public.rooms r
order by r.created_at;
