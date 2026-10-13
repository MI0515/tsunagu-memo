-- つなぐメモ：メモの説明文と、新しい初期メモ（3種類）
--
-- 変わること：
--   - memos に「説明」（description、200文字まで・空でもよい）の列を足す
--   - これから作るルームの初期メモを、次の3つにする
--       ① 日々、大切にしたいこと ② 普段と違う予定の日 ③ 送る言葉
-- 変わらないこと：
--   - すでにあるルームのメモ・確認リスト・スタンプ・振り返り・メンバー（何も消さない）

alter table public.memos
  add column description text check (char_length(description) <= 200);

-- メンバーは、見出しと同じように説明も直せる
grant update (description) on public.memos to authenticated;

-- 初期メモを入れる（ルーム作成の時に create_room から呼ばれる）
create or replace function public._seed_memos(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memo uuid;
begin
  insert into public.memos (room_id, title, description, position)
  values (p_room_id, '日々、大切にしたいこと', '日常の中で、何度でも思い出したい心がけや価値観。', 1)
  returning id into v_memo;
  insert into public.memo_items (memo_id, room_id, body, position)
  select v_memo, p_room_id, t.body, t.pos
  from (values
    (1, '不平不満を感じたときは、当たり前になっている感謝を忘れていないか振り返る'),
    (2, '自分にとっての当たり前が、相手にとっても同じとは限らないことを忘れない'),
    (3, '相手の言動が理解できないときは、推測だけで決めつけず、まず本人に確認する'),
    (4, '自分の気持ちも相手の気持ちも大切にし、どちらか一方が我慢する関係にしない'),
    (5, 'うまくいかなかったときは、誰かを責めるより先に、何が原因でどう改善できるか考える')
  ) as t (pos, body);

  insert into public.memos (room_id, title, description, position)
  values (p_room_id, '普段と違う予定の日', '予定が変わる日や、連絡が難しくなりそうな日に確認したい具体策。', 2)
  returning id into v_memo;
  insert into public.memo_items (memo_id, room_id, body, position)
  select v_memo, p_room_id, t.body, t.pos
  from (values
    (1, '予定が分かった時点で、連絡が難しくなりそうな時間帯と、連絡できそうなタイミングを共有する'),
    (2, '予定や連絡できる時間が変わったら、分かった時点で短く伝える'),
    (3, '長く連絡できなかったあとは、詳しい説明より先に、無事であることと今の状況を短く伝える'),
    (4, '相手の反応が気になって考え込みそうなときは、憶測で結論を出さず、落ち着いてから話したいことを先に伝える'),
    (5, '落ち着いたあと、伝えられていないことや補足が必要なことに気づいたら、対応を考える')
  ) as t (pos, body);

  insert into public.memos (room_id, title, description, position)
  values (p_room_id, '送る言葉', '余裕がないときの一次対応に使える定型文。項目をタップしてコピーし、LINEなどに貼り付けて使えます。', 3)
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

-- 内部用の関数なので、だれからも直接は呼べないようにしておく
revoke execute on function public._seed_memos(uuid) from public, anon, authenticated;
