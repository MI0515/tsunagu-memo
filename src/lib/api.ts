"use client";

import { getSupabase } from "./supabase";
import { AppError, toAppError } from "./errors";
import type { Check, DayEntry, Memo, MemoItem, MemoSummary, Member } from "./types";

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
    throw new AppError(error?.status === 429 ? "rate_limited" : "signin_failed");
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
    .select("id, room_id, title, position, created_at, memo_items(count)")
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
    sb.from("memos").select("id, room_id, title, position, created_at").eq("id", memoId).maybeSingle(),
    sb.from("memo_items").select("id, memo_id, room_id, body, position, created_at")
      .eq("memo_id", memoId).order("position").order("created_at"),
  ]);
  const error = memo.error ?? items.error;
  if (error) throw toAppError(error);
  return memo.data ? { memo: memo.data, items: items.data ?? [] } : null;
}

export async function createMemo(roomId: string, title: string, position: number): Promise<string> {
  const { data, error } = await getSupabase()
    .from("memos").insert({ room_id: roomId, title, position }).select("id").single();
  if (error) throw toAppError(error);
  return data.id;
}

export async function renameMemo(memoId: string, title: string) {
  const { error } = await getSupabase().from("memos").update({ title }).eq("id", memoId);
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
  const [entries, checks, members] = await Promise.all([
    sb.from("day_entries").select("id, room_id, date, body, memo_item_id, position, created_at")
      .eq("room_id", roomId).eq("date", date).order("position").order("created_at"),
    sb.from("checks").select("entry_id, slot, user_id, room_id, date, created_at")
      .eq("room_id", roomId).eq("date", date).order("created_at"),
    sb.from("room_members").select("user_id, display_name, role, color, emoji, left_at")
      .eq("room_id", roomId).order("joined_at"),
  ]);
  const error = entries.error ?? checks.error ?? members.error;
  if (error) throw toAppError(error);
  return {
    entries: (entries.data ?? []) as DayEntry[],
    checks: (checks.data ?? []) as Check[],
    members: (members.data ?? []) as Member[],
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
