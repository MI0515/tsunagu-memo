"use client";

import { useEffect, useRef } from "react";
import { getSupabase } from "./supabase";

// ルームの表に変更があったら onChange を呼ぶ（続けて届いた変更は、少しまとめて1回にする）。
// 削除の通知にはルームIDが含まれないため、削除はルームで絞らずに受け取り、読み直しで正しい状態にする。
// スマホでアプリに戻ってきた時も、通知を取りこぼしているかもしれないので読み直す。
export function useRealtime(roomId: string, tables: string[], onChange: () => void) {
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  });

  const key = tables.join(",");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => callback.current(), 250);
    };

    const filter = `room_id=eq.${roomId}`;
    let channel = getSupabase().channel(`room-${roomId}-${key}-${Math.random().toString(36).slice(2)}`);
    for (const table of key.split(",")) {
      channel = channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table, filter }, schedule)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table, filter }, schedule)
        .on("postgres_changes", { event: "DELETE", schema: "public", table }, schedule);
    }
    channel.subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      getSupabase().removeChannel(channel);
    };
  }, [roomId, key]);
}
