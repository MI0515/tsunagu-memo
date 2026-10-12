"use client";

import { getSupabase } from "./supabase";
import { AppError } from "./errors";

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

export async function hasSession() {
  const { data } = await getSupabase().auth.getSession();
  return data.session !== null;
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

export type MyRoom = { id: string; name: string; role: "owner" | "member"; display_name: string };

// 自分が入っているルーム
export async function listMyRooms(): Promise<MyRoom[]> {
  const sb = getSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await sb
    .from("room_members")
    .select("role, display_name, rooms(id, name)")
    .eq("user_id", auth.user.id)
    .order("joined_at");
  if (error) throw new AppError(error.message);
  return (data ?? []).flatMap((m) => {
    const room = m.rooms as unknown as { id: string; name: string } | null;
    return room ? [{ id: room.id, name: room.name, role: m.role, display_name: m.display_name }] : [];
  });
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
  if (error) throw new AppError(error.message);
  return data;
}

export function inviteUrl(token: string) {
  return `${window.location.origin}/join/${token}`;
}
