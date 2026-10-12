"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "./supabase";
import { loadRoomDay } from "./api";
import { errorMessage } from "./errors";
import type { Item, Member, Stamp } from "./types";

export type RoomDay = { items: Item[]; stamps: Stamp[]; members: Member[] };

// ある日のルームの様子を読み込み、ほかの人の変更をリアルタイムで反映する
export function useRoomDay(roomId: string, date: string) {
  const [data, setData] = useState<RoomDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const itemIds = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await loadRoomDay(roomId, date);
      itemIds.current = new Set(next.items.map((i) => i.id));
      setData(next);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [roomId, date]);

  useEffect(() => {
    setData(null);
    reload();
  }, [reload]);

  useEffect(() => {
    // 変更が続けて届いても、読み込みは少しまとめて1回にする
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(reload, 250);
    };
    // 削除の通知にはルームIDが含まれないため、表示中の項目かどうかで判断する
    const onDelete = (payload: { old: Record<string, unknown> }) => {
      const id = (payload.old.item_id ?? payload.old.id) as string | undefined;
      if (id && itemIds.current.has(id)) schedule();
    };
    const filter = `room_id=eq.${roomId}`;
    const channel = getSupabase()
      .channel(`room-${roomId}-${date}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "items", filter }, schedule)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "items", filter }, schedule)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "items" }, onDelete)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stamps", filter }, schedule)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "stamps" }, onDelete)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_members", filter }, schedule)
      .subscribe();

    // スマホでアプリに戻ってきた時は、通知を取りこぼしているかもしれないので読み直す
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      getSupabase().removeChannel(channel);
    };
  }, [roomId, date, reload]);

  return { data, setData, error, reload };
}
