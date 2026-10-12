-- 移行ファイル 20261014000001_memo_model.sql を入れる前に実行して、
-- 「消えるもの」と「残るもの」の件数を確かめるためのSQLです（何も変更しません）。

select '消える' as 区分, 'items（その場で作った確認項目）' as 内容, count(*) as 件数 from public.items
union all select '消える', 'stamps（✅👀🙏💙のスタンプ）', count(*) from public.stamps
union all select '消える', 'templates（テンプレ）', count(*) from public.templates
union all select '消える', 'template_items（テンプレの中身）', count(*) from public.template_items
union all select '消える', 'template_expansions（テンプレを展開した記録）', count(*) from public.template_expansions
union all select '消える', 'phrases（定型文）', count(*) from public.phrases
union all select '残る', 'rooms（ルーム）', count(*) from public.rooms
union all select '残る', 'room_members（メンバー）', count(*) from public.room_members
union all select '残る', 'invites（招待リンク）', count(*) from public.invites
union all select '残る', 'day_stars（⭐）', count(*) from public.day_stars;
