"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Loading } from "@/components/ui";
import { addStamp, getAppInfo, removeStamp, type MyRoom } from "@/lib/api";
import { formatDay, jstToday } from "@/lib/date";
import { errorMessage } from "@/lib/errors";
import { tapFeedback } from "@/lib/feedback";
import type { StampKind } from "@/lib/types";
import { useRoomDay } from "@/lib/useRoomDay";
import { AddItemSheet } from "./AddItemSheet";
import { ItemCard } from "./ItemCard";
import { ItemDetailSheet } from "./ItemDetailSheet";

const LAST_ROOM_KEY = "tsunagu:lastRoom";

function readLastRoom() {
  try {
    return localStorage.getItem(LAST_ROOM_KEY);
  } catch {
    return null;
  }
}

function saveLastRoom(id: string) {
  try {
    localStorage.setItem(LAST_ROOM_KEY, id);
  } catch {
    // 保存できない環境でも、そのまま使える
  }
}

// 日本時間の0時を過ぎたら「今日」を切り替える
function useToday() {
  const [today, setToday] = useState(jstToday);
  useEffect(() => {
    const check = () => setToday(jstToday());
    const timer = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return today;
}

export function Home({ rooms, myId }: { rooms: MyRoom[]; myId: string }) {
  const [roomId, setRoomId] = useState(() => {
    const last = readLastRoom();
    return rooms.some((r) => r.id === last) ? last! : rooms[0].id;
  });
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const today = useToday();
  const { data, setData, error, reload } = useRoomDay(room.id, today);
  const [adding, setAdding] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [warnDays, setWarnDays] = useState<number | null>(null);

  useEffect(() => {
    getAppInfo().then((info) => setWarnDays(info.inactive_warn_days)).catch(() => {});
  }, []);

  const names = useMemo(
    () => new Map((data?.members ?? []).map((m) => [m.user_id, m.display_name])),
    [data?.members],
  );

  const idleDays = Math.floor((Date.now() - new Date(room.last_activity_at).getTime()) / 86_400_000);

  function selectRoom(id: string) {
    tapFeedback();
    setRoomId(id);
    saveLastRoom(id);
    setOpenItemId(null);
  }

  // スタンプは押した瞬間に画面へ反映し、保存に失敗したら元に戻す
  async function toggleStamp(itemId: string, kind: StampKind) {
    if (!data) return;
    setActionError(null);
    const key = { item_id: itemId, date: today, user_id: myId, kind };
    const exists = data.stamps.some(
      (s) => s.item_id === itemId && s.user_id === myId && s.kind === kind,
    );
    const before = data.stamps;
    setData({
      ...data,
      stamps: exists
        ? before.filter((s) => !(s.item_id === itemId && s.user_id === myId && s.kind === kind))
        : [...before, { ...key, room_id: room.id, created_at: new Date().toISOString() }],
    });
    try {
      if (exists) await removeStamp(key);
      else await addStamp({ ...key, room_id: room.id });
    } catch (e) {
      setData((d) => (d ? { ...d, stamps: before } : d));
      setActionError(errorMessage(e));
    }
  }

  const openItem = data?.items.find((i) => i.id === openItemId);
  const nextPosition = Math.max(0, ...(data?.items.map((i) => i.position) ?? [])) + 1;

  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-lg font-bold text-primary">つなぐメモ</p>
          <p className="text-muted">{formatDay(today)}</p>
        </div>

        {rooms.length > 1 ? (
          <nav aria-label="ルームの切り替え" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {rooms.map((r) => (
              <button
                key={r.id}
                onClick={() => selectRoom(r.id)}
                aria-current={r.id === room.id}
                className={`min-h-11 shrink-0 rounded-full border-2 px-4 font-bold transition-colors active:scale-95 ${
                  r.id === room.id ? "border-primary bg-primary text-on-primary" : "border-border bg-bg text-muted"
                }`}
              >
                {r.name}
              </button>
            ))}
          </nav>
        ) : (
          <h1 className="text-2xl font-bold">{room.name}</h1>
        )}

        <div className="flex gap-4 text-primary">
          {room.role === "owner" && (
            <Link href={`/invite/${room.id}`} className="underline underline-offset-4">招待リンク</Link>
          )}
        </div>
      </header>

      {warnDays !== null && idleDays >= warnDays && (
        <p className="rounded-2xl bg-alert-bg px-4 py-3 text-alert-text">
          このルームは、しばらく記録がありません。スタンプを1つ押すと、自動整理の対象から外れます。
        </p>
      )}
      {(error || actionError) && <Alert>{actionError ?? error}</Alert>}

      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <section className="rounded-3xl border-2 border-dashed border-border p-6 text-center text-muted">
          <p className="text-lg">今日の項目は、まだありません。</p>
          <p className="mt-1">下の「＋ 項目を追加」から足せます。</p>
        </section>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              stamps={data.stamps.filter((s) => s.item_id === item.id)}
              names={names}
              myId={myId}
              onToggle={(kind) => toggleStamp(item.id, kind)}
              onOpen={() => setOpenItemId(item.id)}
            />
          ))}
        </ul>
      )}

      <div className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] mt-auto">
        <Button onClick={() => setAdding(true)} className="shadow-lg">＋ 項目を追加</Button>
      </div>

      {adding && (
        <AddItemSheet
          roomId={room.id}
          today={today}
          nextPosition={nextPosition}
          onClose={() => setAdding(false)}
          onAdded={reload}
        />
      )}
      {openItem && data && (
        <ItemDetailSheet
          key={openItem.id}
          item={openItem}
          stamps={data.stamps.filter((s) => s.item_id === openItem.id)}
          names={names}
          onClose={() => setOpenItemId(null)}
          onChanged={reload}
        />
      )}
    </>
  );
}
