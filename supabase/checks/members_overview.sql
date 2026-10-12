-- ルームのメンバーと、その人に結びついた記録の数を一覧にする（読むだけで、何も変更しません）
-- メンバー整理の前に、だれを消すと何に影響するかを確かめるために使う。

select
  r.name as ルーム,
  m.display_name as 表示名,
  m.role as 役割,
  m.emoji as 絵文字,
  m.color as 色,
  to_char(m.joined_at at time zone 'Asia/Tokyo', 'MM/DD HH24:MI') as 参加日時,
  m.left_at is not null as 退出済み,
  u.is_anonymous as 匿名ユーザー,
  (select count(*) from public.room_members o where o.user_id = m.user_id and o.room_id <> m.room_id) as ほかのルーム,
  (select count(*) from public.rooms x where x.created_by = m.user_id) as 作ったルーム,
  (select count(*) from public.checks c where c.user_id = m.user_id) as スタンプ,
  (select count(*) from public.reflections f where f.author_id = m.user_id) as 振り返り,
  (select count(*) from public.reflection_notes n where n.author_id = m.user_id) as 追記,
  (select count(*) from public.day_entries e where e.created_by = m.user_id) as 足した項目,
  (select count(*) from public.day_stars s where s.starred_by = m.user_id) as 付けた星,
  m.user_id
from public.room_members m
join public.rooms r on r.id = m.room_id
left join auth.users u on u.id = m.user_id
order by r.name, m.joined_at;
