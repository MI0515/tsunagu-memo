-- どのルームにも入っていないユーザーの一覧（読むだけで、何も変更しません）
-- 招待リンクを開いただけの人や、動作確認で作られた匿名ユーザーがここに出る。

select
  u.id as user_id,
  u.is_anonymous as 匿名ユーザー,
  to_char(u.created_at at time zone 'Asia/Tokyo', 'MM/DD HH24:MI') as 作成日時,
  to_char(u.last_sign_in_at at time zone 'Asia/Tokyo', 'MM/DD HH24:MI') as 最後のログイン
from auth.users u
where not exists (select 1 from public.room_members m where m.user_id = u.id)
order by u.created_at;
