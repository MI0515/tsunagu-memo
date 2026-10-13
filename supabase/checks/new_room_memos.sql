-- いちばん新しく作られたルームの、初期メモを確かめる（読むだけで、何も変更しません）
-- 期待する結果：3行。順番に「日々、大切にしたいこと（5項目）」「普段と違う予定の日（5項目）」「送る言葉（3項目）」。
-- 説明ありが すべて true で、古い項目 が すべて 0 なら正しい。

with newest as (
  select id, name from public.rooms order by created_at desc limit 1
)
select
  n.name as ルーム,
  m.position as 順番,
  m.title as 見出し,
  m.description is not null and m.description <> '' as 説明あり,
  (select count(*) from public.memo_items i where i.memo_id = m.id) as 項目数,
  (select i.body from public.memo_items i where i.memo_id = m.id order by i.position limit 1) as 一つ目の項目,
  (select count(*) from public.memo_items i
     where i.memo_id = m.id and (i.body like '%メモを確認%' or i.body like '%できたか振り返る%')) as 古い項目
from newest n
join public.memos m on m.room_id = n.id
order by m.position;
