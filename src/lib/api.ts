"use client";

import { getSupabase } from "./supabase";
import { AppError, toAppError } from "./errors";
import type { Check, DayEntry, Memo, MemoItem, MemoSummary, Member, Reflection } from "./types";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

// DB関数を呼び、{ok:false} ならエラーとして投げる
async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) throw toAppError(error);
  const result = data as Result<T>;
  if (result && typeof result === "object" && "ok" in result && !result.ok) {
    throw new AppError(result.error);
  }
  return result as T;
}

// ルーム作成・招待参加の時にだけ、匿名ログインする
export async function ensureSession(captchaToken?: string) {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session;
  const { data: signedIn, error } = await sb.auth.signInAnonymously(
    captchaToken ? { options: { captchaToken } } : undefined,
  );
  if (error || !signedIn.session) {
    const code = error?.code === "captcha_failed" ? "captcha_failed" : error?.status === 429 ? "rate_limited" : "signin_failed";
    throw new AppError(code);
  }
  return signedIn.session;
}

export type AppInfo = {
  is_demo: boolean;
  inactive_warn_days: number;
  inactive_cleanup_days: number;
  requires_creation_code: boolean;
};

export const getAppInfo = () => rpc<AppInfo>("get_app_info");

export const createRoom = (name: string, displayName: string, code: string | null) =>
  rpc<{ room_id: string }>("create_room", { p_name: name, p_display_name: displayName, p_code: code });

export const getInviteInfo = (token: string) =>
  rpc<{ room_name: string; expired: boolean }>("get_invite_info", { p_token: token });

export const joinRoom = (token: string, displayName: string) =>
  rpc<{ room_id: string }>("join_room", { p_token: token, p_display_name: displayName });

export const regenerateInvite = (roomId: string) =>
  rpc<{ token: string }>("regenerate_invite", { p_room_id: roomId });

export type MyRoom = {
  id: string;
  name: string;
  role: "owner" | "member";
  display_name: string;
  last_activity_at: string;
};

export async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

// 自分が入っているルーム
export async function listMyRooms(): Promise<MyRoom[]> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await sb
    .from("room_members")
    .select("role, display_name, rooms(id, name, last_activity_at)")
    .eq("user_id", uid)
    .order("joined_at");
  if (error) throw toAppError(error);
  return (data ?? []).flatMap((m) => {
    const room = m.rooms as unknown as { id: string; name: string; last_activity_at: string } | null;
    return room ? [{ ...room, role: m.role, display_name: m.display_name }] : [];
  });
}

// ---------------------------------------------------------------
// メモ
// ---------------------------------------------------------------
export async function listMemos(roomId: string): Promise<MemoSummary[]> {
  const { data, error } = await getSupabase()
    .from("memos")
    .select("id, room_id, title, description, position, created_at, memo_items(count)")
    .eq("room_id", roomId)
    .order("position")
    .order("created_at");
  if (error) throw toAppError(error);
  return (data ?? []).map(({ memo_items, ...memo }) => ({
    ...memo,
    item_count: (memo_items as unknown as { count: number }[])[0]?.count ?? 0,
  }));
}

// メモと、その項目（見つからない時は null）
export async function getMemo(memoId: string): Promise<{ memo: Memo; items: MemoItem[] } | null> {
  const sb = getSupabase();
  const [memo, items] = await Promise.all([
    sb.from("memos").select("id, room_id, title, description, position, created_at").eq("id", memoId).maybeSingle(),
    sb.from("memo_items").select("id, memo_id, room_id, body, position, created_at")
      .eq("memo_id", memoId).order("position").order("created_at"),
  ]);
  const error = memo.error ?? items.error;
  if (error) throw toAppError(error);
  return memo.data ? { memo: memo.data, items: items.data ?? [] } : null;
}

export async function createMemo(roomId: string, title: string, description: string, position: number): Promise<string> {
  const { data, error } = await getSupabase()
    .from("memos").insert({ room_id: roomId, title, description: description || null, position }).select("id").single();
  if (error) throw toAppError(error);
  return data.id;
}

export async function updateMemo(memoId: string, title: string, description: string) {
  const { error } = await getSupabase().from("memos").update({ title, description: description || null }).eq("id", memoId);
  if (error) throw toAppError(error);
}

export async function deleteMemo(memoId: string) {
  const { error } = await getSupabase().from("memos").delete().eq("id", memoId);
  if (error) throw toAppError(error);
}

export async function addMemoItem(memo: Memo, body: string, position: number) {
  const { error } = await getSupabase()
    .from("memo_items").insert({ memo_id: memo.id, room_id: memo.room_id, body, position });
  if (error) throw toAppError(error);
}

export async function updateMemoItem(itemId: string, body: string) {
  const { error } = await getSupabase().from("memo_items").update({ body }).eq("id", itemId);
  if (error) throw toAppError(error);
}

export async function deleteMemoItem(itemId: string) {
  const { error } = await getSupabase().from("memo_items").delete().eq("id", itemId);
  if (error) throw toAppError(error);
}

// ---------------------------------------------------------------
// 確認リスト（☀️🌙）
// ---------------------------------------------------------------
export async function loadDay(roomId: string, date: string) {
  const sb = getSupabase();
  const [entries, checks, members, star] = await Promise.all([
    sb.from("day_entries").select("id, room_id, date, body, memo_item_id, position, created_at")
      .eq("room_id", roomId).eq("date", date).order("position").order("created_at"),
    sb.from("checks").select("entry_id, slot, user_id, room_id, date, created_at")
      .eq("room_id", roomId).eq("date", date).order("created_at"),
    sb.from("room_members").select("user_id, display_name, role, color, emoji, left_at")
      .eq("room_id", roomId).order("joined_at"),
    sb.from("day_stars").select("date").eq("room_id", roomId).eq("date", date).maybeSingle(),
  ]);
  const error = entries.error ?? checks.error ?? members.error ?? star.error;
  if (error) throw toAppError(error);
  return {
    entries: (entries.data ?? []) as DayEntry[],
    checks: (checks.data ?? []) as Check[],
    members: (members.data ?? []) as Member[],
    starred: star.data !== null,
  };
}

export async function addCheck(check: Omit<Check, "created_at">) {
  const { error } = await getSupabase().from("checks").insert(check);
  // 続けて押した時の重複は、押せているので成功扱い
  if (error && error.code !== "23505") throw toAppError(error);
}

export async function removeCheck(check: Pick<Check, "entry_id" | "slot" | "user_id">) {
  const { error } = await getSupabase().from("checks").delete()
    .match({ entry_id: check.entry_id, slot: check.slot, user_id: check.user_id });
  if (error) throw toAppError(error);
}

export async function addAdhocEntry(roomId: string, date: string, body: string) {
  const uid = await currentUserId();
  const { error } = await getSupabase().from("day_entries")
    .insert({ room_id: roomId, date, body, created_by: uid });
  if (error) throw toAppError(error);
}

export async function deleteEntry(entryId: string) {
  const { error } = await getSupabase().from("day_entries").delete().eq("id", entryId);
  if (error) throw toAppError(error);
}

// ---------------------------------------------------------------
// 選んで追加
// ---------------------------------------------------------------
export const addToDay = (roomId: string, date: string, memoItemIds: string[]) =>
  rpc<{ added: number; skipped: number }>("add_to_day", {
    p_room_id: roomId,
    p_date: date,
    p_memo_item_ids: memoItemIds,
  });

// 前回選んだメモ項目のID
export async function lastSelection(roomId: string): Promise<string[]> {
  const { data, error } = await getSupabase().rpc("last_selection", { p_room_id: roomId });
  if (error) throw toAppError(error);
  return (data ?? []) as string[];
}

// 今日・明日の確認リストに、すでに入っているメモ項目
export async function memoItemsInDays(roomId: string, dates: string[]) {
  const { data, error } = await getSupabase()
    .from("day_entries")
    .select("date, memo_item_id")
    .eq("room_id", roomId)
    .in("date", dates)
    .not("memo_item_id", "is", null);
  if (error) throw toAppError(error);
  return (data ?? []) as { date: string; memo_item_id: string }[];
}

// ---------------------------------------------------------------
// ⭐と振り返り
// ---------------------------------------------------------------
export async function setStar(roomId: string, date: string, on: boolean) {
  const sb = getSupabase();
  if (on) {
    const { error } = await sb.from("day_stars").insert({ room_id: roomId, date, starred_by: await currentUserId() });
    // ほかの人が先に付けていた時は、付いているので成功扱い
    if (error && error.code !== "23505") throw toAppError(error);
  } else {
    const { error } = await sb.from("day_stars").delete().match({ room_id: roomId, date });
    if (error) throw toAppError(error);
  }
}

export async function loadReflections(roomId: string, date: string): Promise<Reflection[]> {
  const { data, error } = await getSupabase()
    .from("reflections")
    .select("id, room_id, date, author_id, body, created_at, updated_at, reflection_notes(id, reflection_id, room_id, author_id, body, created_at, updated_at)")
    .eq("room_id", roomId)
    .eq("date", date)
    .order("created_at")
    .order("created_at", { referencedTable: "reflection_notes" });
  if (error) throw toAppError(error);
  return (data ?? []) as Reflection[];
}

export async function writeReflection(roomId: string, date: string, body: string) {
  const { error } = await getSupabase()
    .from("reflections").insert({ room_id: roomId, date, author_id: await currentUserId(), body });
  if (error) throw toAppError(error);
}

export async function updateReflection(id: string, body: string) {
  const { error } = await getSupabase().from("reflections").update({ body }).eq("id", id);
  if (error) throw toAppError(error);
}

export async function deleteReflection(id: string) {
  const { error } = await getSupabase().from("reflections").delete().eq("id", id);
  if (error) throw toAppError(error);
}

export async function addNote(reflection: Pick<Reflection, "id" | "room_id">, body: string) {
  const { error } = await getSupabase().from("reflection_notes")
    .insert({ reflection_id: reflection.id, room_id: reflection.room_id, author_id: await currentUserId(), body });
  if (error) throw toAppError(error);
}

export async function updateNote(id: string, body: string) {
  const { error } = await getSupabase().from("reflection_notes").update({ body }).eq("id", id);
  if (error) throw toAppError(error);
}

export async function deleteNote(id: string) {
  const { error } = await getSupabase().from("reflection_notes").delete().eq("id", id);
  if (error) throw toAppError(error);
}

// ---------------------------------------------------------------
// ⭐一覧（お気に入りにした日）
// ---------------------------------------------------------------
export type DaySummary = {
  date: string;
  entry_count: number;
  check_count: number;
  reflection_authors: string[];
  starred: boolean;
};

// 記録のある日の一覧。from・to（"YYYY-MM-DD"）で期間を、starredOnly でお気に入りだけに絞る
export async function listDays(roomId: string, options: { starredOnly?: boolean; from?: string; to?: string } = {}) {
  const sb = getSupabase();
  const [days, members] = await Promise.all([
    sb.rpc("day_summaries", {
      p_room_id: roomId,
      p_starred_only: options.starredOnly ?? false,
      p_from: options.from ?? null,
      p_to: options.to ?? null,
    }),
    sb.from("room_members").select("user_id, display_name, role, color, emoji, left_at").eq("room_id", roomId),
  ]);
  const error = days.error ?? members.error;
  if (error) throw toAppError(error);
  return { days: (days.data ?? []) as DaySummary[], members: (members.data ?? []) as Member[] };
}

// ---------------------------------------------------------------
// 検索（確認リストの文・振り返り・追記から探す）
// ---------------------------------------------------------------
export type SearchHit = {
  key: string;
  date: string;
  kind: "entry" | "reflection" | "note";
  body: string;
  author_id: string | null;
};

const SEARCH_LIMIT = 100;

// 「%」「_」は検索の記号なので、ふつうの文字として探せるようにする
function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function searchRecords(roomId: string, query: string): Promise<{ hits: SearchHit[]; members: Member[]; capped: boolean }> {
  const sb = getSupabase();
  const pattern = likePattern(query.trim());
  const [entries, reflections, notes, members] = await Promise.all([
    sb.from("day_entries").select("id, date, body").eq("room_id", roomId).ilike("body", pattern)
      .order("date", { ascending: false }).limit(SEARCH_LIMIT),
    sb.from("reflections").select("id, date, body, author_id").eq("room_id", roomId).ilike("body", pattern)
      .order("date", { ascending: false }).limit(SEARCH_LIMIT),
    sb.from("reflection_notes").select("id, body, author_id, reflections(date)").eq("room_id", roomId).ilike("body", pattern)
      .order("created_at", { ascending: false }).limit(SEARCH_LIMIT),
    sb.from("room_members").select("user_id, display_name, role, color, emoji, left_at").eq("room_id", roomId),
  ]);
  const error = entries.error ?? reflections.error ?? notes.error ?? members.error;
  if (error) throw toAppError(error);

  const order = { entry: 0, reflection: 1, note: 2 };
  const hits: SearchHit[] = [
    ...(entries.data ?? []).map((e) => ({ key: `e-${e.id}`, date: e.date, kind: "entry" as const, body: e.body, author_id: null })),
    ...(reflections.data ?? []).map((r) => ({ key: `r-${r.id}`, date: r.date, kind: "reflection" as const, body: r.body, author_id: r.author_id })),
    ...(notes.data ?? []).map((n) => ({
      key: `n-${n.id}`,
      date: (n.reflections as unknown as { date: string } | null)?.date ?? "",
      kind: "note" as const,
      body: n.body,
      author_id: n.author_id,
    })),
  ].sort((a, b) => (a.date === b.date ? order[a.kind] - order[b.kind] : a.date < b.date ? 1 : -1));

  const capped = [entries.data, reflections.data, notes.data].some((d) => (d?.length ?? 0) >= SEARCH_LIMIT);
  return { hits, members: (members.data ?? []) as Member[], capped };
}

// ---------------------------------------------------------------
// 設定（自分の見え方・ルーム・メンバー・退出・削除）
// ---------------------------------------------------------------
export async function listMembers(roomId: string): Promise<Member[]> {
  const { data, error } = await getSupabase()
    .from("room_members")
    .select("user_id, display_name, role, color, emoji, left_at")
    .eq("room_id", roomId)
    .is("left_at", null)
    .order("joined_at");
  if (error) throw toAppError(error);
  return (data ?? []) as Member[];
}

export async function updateDisplayName(roomId: string, displayName: string) {
  const uid = await currentUserId();
  const { error } = await getSupabase().from("room_members")
    .update({ display_name: displayName }).match({ room_id: roomId, user_id: uid });
  if (error) throw toAppError(error);
}

export const setMemberLook = (roomId: string, color: number, emoji: string) =>
  rpc<object>("set_member_look", { p_room_id: roomId, p_color: color, p_emoji: emoji });

export async function renameRoom(roomId: string, name: string) {
  const { error } = await getSupabase().from("rooms").update({ name }).eq("id", roomId);
  if (error) throw toAppError(error);
}

export const transferOwner = (roomId: string, newOwner: string) =>
  rpc<object>("transfer_owner", { p_room_id: roomId, p_new_owner: newOwner });

export const removeMember = (roomId: string, userId: string) =>
  rpc<object>("remove_member", { p_room_id: roomId, p_user_id: userId });

export const leaveRoom = (roomId: string, mode: "keep" | "erase") =>
  rpc<{ room_deleted: boolean }>("leave_room", { p_room_id: roomId, p_mode: mode });

export const deleteRoom = (roomId: string, confirmName: string) =>
  rpc<object>("delete_room", { p_room_id: roomId, p_confirm_name: confirmName });

// ---------------------------------------------------------------
// 引き継ぎ（Safari → ホーム画面のアプリ、機種変更）
// ---------------------------------------------------------------
export const issueHandoffCode = () => rpc<{ code: string }>("issue_handoff_code");

// 引き継ぎコード（または復元用の合言葉）で、今の端末を同じ本人にする
export async function redeemIdentity(secret: string, captchaToken?: string) {
  await ensureSession(captchaToken);
  return rpc<object>("redeem_identity", { p_secret: secret });
}

export type ActiveInvite = { token: string; expires_at: string } | null;

// いま使える招待リンク（オーナーだけが読める）
export async function getActiveInvite(roomId: string): Promise<ActiveInvite> {
  const { data, error } = await getSupabase()
    .from("invites")
    .select("token, expires_at")
    .eq("room_id", roomId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw toAppError(error);
  return data;
}

export function inviteUrl(token: string) {
  return `${window.location.origin}/join/${token}`;
}
