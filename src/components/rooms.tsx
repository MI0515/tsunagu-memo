"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Loading, Page } from "@/components/ui";
import { Welcome } from "@/components/Welcome";
import { currentUserId, listMyRooms, type MyRoom } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { tapFeedback } from "@/lib/feedback";

type RoomContextValue = {
  rooms: MyRoom[];
  room: MyRoom;
  myId: string;
  selectRoom: (id: string) => void;
  reloadRooms: () => Promise<void>;
};

const RoomContext = createContext<RoomContextValue | null>(null);

// いま選んでいるルーム（タブの中の画面から使う）
export function useRoom(): RoomContextValue {
  const value = useContext(RoomContext);
  if (!value) throw new Error("useRoom は RoomProvider の中で使ってください");
  return value;
}

const LAST_ROOM_KEY = "tsunagu:lastRoom";

function readLastRoom() {
  try {
    return localStorage.getItem(LAST_ROOM_KEY);
  } catch {
    return null;
  }
}

export function saveLastRoom(id: string) {
  try {
    localStorage.setItem(LAST_ROOM_KEY, id);
  } catch {
    // 保存できない環境でも、そのまま使える
  }
}

// 自分のルームを読み込む。ルームがなければ、はじめての人向けの画面を出す
export function RoomProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ rooms: MyRoom[]; myId: string | null } | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reloadRooms = useCallback(async () => {
    try {
      const myId = await currentUserId();
      const rooms = myId ? await listMyRooms() : [];
      setState({ rooms, myId });
      setRoomId((current) => {
        const wanted = current ?? readLastRoom();
        return rooms.some((r) => r.id === wanted) ? wanted : (rooms[0]?.id ?? null);
      });
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
      setState((s) => s ?? { rooms: [], myId: null });
    }
  }, []);

  useEffect(() => {
    reloadRooms();
  }, [reloadRooms]);

  const selectRoom = useCallback((id: string) => {
    setRoomId(id);
    saveLastRoom(id);
  }, []);

  if (!state) return <Page><Loading /></Page>;

  const room = state.rooms.find((r) => r.id === roomId);
  if (!room || !state.myId) return <Welcome error={error} />;

  return (
    <RoomContext.Provider value={{ rooms: state.rooms, room, myId: state.myId, selectRoom, reloadRooms }}>
      {children}
    </RoomContext.Provider>
  );
}

// 画面上部：アプリ名と、ルームの切り替え（2つ以上ある時だけ）
export function RoomHeader() {
  const { rooms, room, selectRoom } = useRoom();
  return (
    <header className="flex flex-col gap-2">
      <p className="text-lg font-bold text-primary">つなぐメモ</p>
      {rooms.length > 1 ? (
        <nav aria-label="ルームの切り替え" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {rooms.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                tapFeedback();
                selectRoom(r.id);
              }}
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
        <p className="text-muted">{room.name}</p>
      )}
    </header>
  );
}
