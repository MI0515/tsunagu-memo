"use client";

import { getSupabase } from "./supabase";
import { AppError } from "./errors";
import type { Item, ItemKind, Member, Stamp } from "./types";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

// DB関数を呼び、{ok:false} ならエラーとして投げる
async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) throw new AppError(error.message || "unknown");
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
  if (error) throw new AppError(error.message);
  return (data ?? []).flatMap((m) => {
    const room = m.rooms as unknown as { id: string; name: string; last_activity_at: string } | null;
    return room ? [{ ...room, role: m.role, display_name: m.display_name }] : [];
  });
}

// ある日のルームの様子（項目・スタンプ・メンバー）
export async function loadRoomDay(roomId: string, date: string) {
  const sb = getSupabase();
  const [items, stamps, members] = await Promise.all([
    sb.rpc("items_on", { p_room_id: roomId, p_date: date }),
    sb.from("stamps").select("*").eq("room_id", roomId).eq("date", date).order("created_at"),
    sb.from("room_members").select("user_id, display_name, role").eq("room_id", roomId).order("joined_at"),
  ]);
  const error = items.error ?? stamps.error ?? members.error;
  if (error) throw new AppError(error.message);
  return {
    items: (items.data ?? []) as Item[],
    stamps: (stamps.data ?? []) as Stamp[],
    members: (members.data ?? []) as Member[],
  };
}

export async function addStamp(stamp: Omit<Stamp, "created_at">) {
  const { error } = await getSupabase().from("stamps").insert(stamp);
  // 2回続けて押した時の重複は、押せているので成功扱い
  if (error && error.code !== "23505") throw new AppError(error.message);
}

export async function removeStamp(s: Pick<Stamp, "item_id" | "date" | "user_id" | "kind">) {
  const { error } = await getSupabase()
    .from("stamps")
    .delete()
    .match({ item_id: s.item_id, date: s.date, user_id: s.user_id, kind: s.kind });
  if (error) throw new AppError(error.message);
}

export type NewItem = {
  room_id: string;
  title: string;
  kind: ItemKind;
  date?: string;
  weekdays?: number[];
  month_day?: number;
  position: number;
};

export async function addItem(item: NewItem) {
  const uid = await currentUserId();
  const { error } = await getSupabase().from("items").insert({ ...item, created_by: uid });
  if (error) throw new AppError(error.message.includes("item_limit") ? "item_limit" : error.message);
}

export async function renameItem(itemId: string, title: string) {
  const { error } = await getSupabase().from("items").update({ title }).eq("id", itemId);
  if (error) throw new AppError(error.message);
}

export const removeItem = (itemId: string) => rpc<object>("remove_item", { p_item_id: itemId });

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
  if (error) throw new AppError(error.message);
  return data;
}

export function inviteUrl(token: string) {
  return `${window.location.origin}/join/${token}`;
}
