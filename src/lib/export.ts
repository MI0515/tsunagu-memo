"use client";

import { getSupabase } from "./supabase";
import { toAppError } from "./errors";
import { jstToday } from "./date";

// 記録の書き出し。無料プランには自動バックアップがないため、ルームの全記録を手元に保存できるようにする。
// 読み込みは、鍵（RLS）でメンバーが見られる範囲だけ。

const PAGE = 1000; // Supabase が1回に返す件数の上限

// 件数が多くても全部読めるよう、1000件ずつ分けて読む
async function fetchAll<T>(table: string, select: string, roomId: string, order: string[]): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = getSupabase().from(table).select(select).eq("room_id", roomId);
    for (const column of order) query = query.order(column);
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw toAppError(error);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type MemberRow = { user_id: string; display_name: string; role: string; color: number | null; emoji: string | null; joined_at: string; left_at: string | null };
type MemoRow = { id: string; title: string; description: string | null; position: number; created_at: string };
type MemoItemRow = { id: string; memo_id: string; body: string; position: number; created_at: string };
type EntryRow = { id: string; date: string; body: string; memo_item_id: string | null; position: number; created_at: string };
type CheckRow = { entry_id: string; slot: "morning" | "night"; user_id: string; date: string; created_at: string };
type ReflectionRow = { id: string; date: string; author_id: string; body: string; created_at: string; updated_at: string };
type NoteRow = { id: string; reflection_id: string; author_id: string; body: string; created_at: string; updated_at: string };
type StarRow = { date: string; created_at: string };

export type ExportData = Awaited<ReturnType<typeof collect>>;

// ルームの記録を集めて、日付ごとにまとめた形にする
export async function collect(room: { id: string; name: string }) {
  const [members, memos, items, entries, checks, reflections, notes, stars] = await Promise.all([
    fetchAll<MemberRow>("room_members", "user_id, display_name, role, color, emoji, joined_at, left_at", room.id, ["joined_at"]),
    fetchAll<MemoRow>("memos", "id, title, description, position, created_at", room.id, ["position", "created_at"]),
    fetchAll<MemoItemRow>("memo_items", "id, memo_id, body, position, created_at", room.id, ["position", "created_at"]),
    fetchAll<EntryRow>("day_entries", "id, date, body, memo_item_id, position, created_at", room.id, ["date", "position", "created_at"]),
    fetchAll<CheckRow>("checks", "entry_id, slot, user_id, date, created_at", room.id, ["created_at"]),
    fetchAll<ReflectionRow>("reflections", "id, date, author_id, body, created_at, updated_at", room.id, ["date", "created_at"]),
    fetchAll<NoteRow>("reflection_notes", "id, reflection_id, author_id, body, created_at, updated_at", room.id, ["created_at"]),
    fetchAll<StarRow>("day_stars", "date, created_at", room.id, ["date"]),
  ]);

  const nameOf = (userId: string) => {
    const m = members.find((x) => x.user_id === userId);
    return m && !m.left_at ? m.display_name : "退出したメンバー";
  };
  const starred = new Set(stars.map((s) => s.date));
  const dates = [...new Set([...entries.map((e) => e.date), ...reflections.map((r) => r.date), ...starred])].sort();

  return {
    app: "tsunagu-memo",
    format_version: 1,
    exported_at: new Date().toISOString(),
    room: { id: room.id, name: room.name },
    members: members.map((m) => ({
      user_id: m.user_id,
      display_name: m.left_at ? "退出したメンバー" : m.display_name,
      role: m.role,
      color: m.color,
      emoji: m.emoji,
      joined_at: m.joined_at,
      left_at: m.left_at,
    })),
    memos: memos.map((memo) => ({
      id: memo.id,
      title: memo.title,
      description: memo.description,
      created_at: memo.created_at,
      items: items.filter((i) => i.memo_id === memo.id).map((i) => ({ id: i.id, body: i.body, created_at: i.created_at })),
    })),
    days: dates.map((date) => ({
      date,
      starred: starred.has(date),
      entries: entries.filter((e) => e.date === date).map((e) => ({
        id: e.id,
        body: e.body,
        memo_item_id: e.memo_item_id,
        checks: (["morning", "night"] as const).reduce(
          (acc, slot) => ({
            ...acc,
            [slot]: checks
              .filter((c) => c.entry_id === e.id && c.slot === slot)
              .map((c) => ({ user_id: c.user_id, name: nameOf(c.user_id), at: c.created_at })),
          }),
          {} as Record<"morning" | "night", { user_id: string; name: string; at: string }[]>,
        ),
      })),
      reflections: reflections.filter((r) => r.date === date).map((r) => ({
        id: r.id,
        author_id: r.author_id,
        author: nameOf(r.author_id),
        body: r.body,
        created_at: r.created_at,
        updated_at: r.updated_at,
        notes: notes.filter((n) => n.reflection_id === r.id).map((n) => ({
          id: n.id,
          author_id: n.author_id,
          author: nameOf(n.author_id),
          body: n.body,
          created_at: n.created_at,
          updated_at: n.updated_at,
        })),
      })),
    })),
  };
}

// 日本時間の「2026/10/13 21:05」
function jstDateTime(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// CSVの1マス。カンマ・改行・ダブルクォートを含む時は "" で囲む。
// 表計算ソフトで式として動かないよう、= + - @ で始まる文字は先頭に ' を付ける
function cell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(data: ExportData): string {
  const rows: string[][] = [["日付", "お気に入り", "種類", "内容", "書いた人", "☀️朝に押した人", "🌙夜に押した人", "日時"]];
  for (const day of data.days) {
    const star = day.starred ? "⭐" : "";
    for (const e of day.entries) {
      rows.push([day.date, star, "確認リスト", e.body, "",
        e.checks.morning.map((c) => c.name).join("・"), e.checks.night.map((c) => c.name).join("・"), ""]);
    }
    for (const r of day.reflections) {
      rows.push([day.date, star, "振り返り", r.body, r.author, "", "", jstDateTime(r.created_at)]);
      for (const n of r.notes) rows.push([day.date, star, "追記", n.body, n.author, "", "", jstDateTime(n.created_at)]);
    }
    if (day.entries.length === 0 && day.reflections.length === 0 && day.starred) {
      rows.push([day.date, star, "お気に入りのみ", "", "", "", "", ""]);
    }
  }
  for (const memo of data.memos) {
    memo.items.forEach((item, i) => rows.push(["", "", `メモ「${memo.title}」`, `${i + 1}. ${item.body}`, "", "", "", ""]));
  }
  // 先頭の BOM で、Excel でも文字化けしないようにする
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function fileName(roomName: string, ext: "json" | "csv") {
  const safe = roomName.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 30) || "room";
  return `つなぐメモ_${safe}_${jstToday().replace(/-/g, "")}.${ext}`;
}

// 保存する。iPhone などで共有メニューが使える時は「ファイルに保存」などを選べるようにし、使えない時はダウンロードする
export async function saveFile(name: string, content: string, type: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([content], name, { type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // 共有に失敗した時は、ダウンロードに切り替える
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
