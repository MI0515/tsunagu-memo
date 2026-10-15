-- つなぐメモ：メモの項目と、メモ自体の並び替え
--
-- 足すもの：
--   - move_memo_item：メモの項目を「上へ」「下へ」「いちばん上へ」動かす
--   - move_memo     ：メモ一覧の中で、メモを同じように動かす
-- 1回押すごとに、並び順を押さえて（同時に押した人を待たせて）1つ動かし、順番を1から振り直す。
-- 2人が同時に並び替えても、順番が重なったり抜けたりしない。メンバーならだれでも使える（いまの権限と同じ）。
-- 何も消さない。

create or replace function public._move_in_list(p_ids uuid[], p_target uuid, p_to text)
returns uuid[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_idx int := array_position(p_ids, p_target);
  v_len int := coalesce(array_length(p_ids, 1), 0);
  v_tmp uuid;
begin
  if v_idx is null then return p_ids; end if;
  if p_to = 'up' and v_idx > 1 then
    v_tmp := p_ids[v_idx - 1]; p_ids[v_idx - 1] := p_ids[v_idx]; p_ids[v_idx] := v_tmp;
  elsif p_to = 'down' and v_idx < v_len then
    v_tmp := p_ids[v_idx + 1]; p_ids[v_idx + 1] := p_ids[v_idx]; p_ids[v_idx] := v_tmp;
  elsif p_to = 'top' and v_idx > 1 then
    p_ids := array[p_target] || array_remove(p_ids, p_target);
  end if;
  return p_ids;
end;
$$;

create or replace function public.move_memo_item(p_item_id uuid, p_to text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memo uuid;
  v_room uuid;
  v_before uuid[];
  v_after uuid[];
begin
  if p_to not in ('up', 'down', 'top') then return public._fail('bad_direction'); end if;
  select memo_id, room_id into v_memo, v_room from public.memo_items where id = p_item_id;
  if v_memo is null or not public.is_member(v_room) then return public._fail('not_found'); end if;

  -- 同じメモを並び替えている人がいたら、終わるまで待つ
  perform 1 from public.memos where id = v_memo for update;

  select array_agg(id order by position, created_at) into v_before
  from public.memo_items where memo_id = v_memo;
  v_after := public._move_in_list(v_before, p_item_id, p_to);

  update public.memo_items i set position = o.ord
  from unnest(v_after) with ordinality as o (id, ord)
  where i.id = o.id and i.position is distinct from o.ord;

  return jsonb_build_object('ok', true, 'moved', v_after is distinct from v_before);
end;
$$;

create or replace function public.move_memo(p_memo_id uuid, p_to text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid;
  v_before uuid[];
  v_after uuid[];
begin
  if p_to not in ('up', 'down', 'top') then return public._fail('bad_direction'); end if;
  select room_id into v_room from public.memos where id = p_memo_id;
  if v_room is null or not public.is_member(v_room) then return public._fail('not_found'); end if;

  -- 同じルームのメモを並び替えている人がいたら、終わるまで待つ
  perform 1 from public.rooms where id = v_room for update;

  select array_agg(id order by position, created_at) into v_before
  from public.memos where room_id = v_room;
  v_after := public._move_in_list(v_before, p_memo_id, p_to);

  update public.memos m set position = o.ord
  from unnest(v_after) with ordinality as o (id, ord)
  where m.id = o.id and m.position is distinct from o.ord;

  return jsonb_build_object('ok', true, 'moved', v_after is distinct from v_before);
end;
$$;

revoke execute on function public._move_in_list(uuid[], uuid, text) from public, anon, authenticated;
revoke execute on function public.move_memo_item(uuid, text) from public, anon;
revoke execute on function public.move_memo(uuid, text) from public, anon;
grant execute on function public.move_memo_item(uuid, text), public.move_memo(uuid, text) to authenticated;
