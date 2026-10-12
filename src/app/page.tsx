"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppTitle, Alert, Card, LinkButton, Loading, Page } from "@/components/ui";
import { Home } from "@/components/home/Home";
import { currentUserId, listMyRooms, type MyRoom } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

export default function TopPage() {
  const [rooms, setRooms] = useState<MyRoom[] | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const uid = await currentUserId();
        setMyId(uid);
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

  return (
    <Page>
      <Home rooms={rooms} myId={myId!} />
    </Page>
  );
}
