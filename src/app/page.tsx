"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppTitle, Alert, Card, LinkButton, Loading, Page } from "@/components/ui";
import { currentUserId, listMyRooms, type MyRoom } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

export default function TopPage() {
  const [rooms, setRooms] = useState<MyRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const uid = await currentUserId();
        setRooms(uid ? await listMyRooms() : []);
      } catch (e) {
        setError(errorMessage(e));
        setRooms([]);
      }
    })();
  }, []);

  if (rooms === null) return <Page><Loading /></Page>;

  if (rooms.length === 0) {
    return (
      <Page>
        <AppTitle sub="大切な人と、決めたことを一緒に確かめる" />
        {error && <Alert>{error}</Alert>}
        <Card className="flex flex-col gap-3">
          <p>
            余裕があるうちに決めた「こうする」を、チェックリストにしておくアプリです。
            押したスタンプは、ルームのみんなにすぐ届きます。
          </p>
        </Card>
        <div className="flex flex-col gap-3">
          <LinkButton href="/create">ルームを作る</LinkButton>
          <p className="text-center text-muted">
            招待された方は、受け取った招待リンクを開いてください。
          </p>
        </div>
        <footer className="mt-auto text-center">
          <Link href="/notice" className="text-primary underline underline-offset-4">
            ご利用の前に（注意事項）
          </Link>
        </footer>
      </Page>
    );
  }

  // 新しい確認リスト（☀️🌙）ができるまでの仮の表示
  return (
    <Page>
      <AppTitle />
      <Card className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">あなたのルーム</h1>
        <ul className="flex flex-col gap-2">
          {rooms.map((room) => (
            <li key={room.id} className="rounded-2xl bg-bg p-4">
              <p className="text-lg font-bold">{room.name}</p>
              {room.role === "owner" && (
                <Link href={`/invite/${room.id}`} className="text-primary underline underline-offset-4">
                  招待リンク
                </Link>
              )}
            </li>
          ))}
        </ul>
        <p className="text-muted">確認リストは、新しい形に作り直しています。</p>
      </Card>
    </Page>
  );
}
