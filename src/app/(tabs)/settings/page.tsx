"use client";

import { Card, LinkButton } from "@/components/ui";
import { useRoom } from "@/components/rooms";

// 設定は手順7で作る。いまは招待リンクだけ
export default function SettingsPage() {
  const { room } = useRoom();
  return (
    <>
      <h1 className="text-2xl font-bold">設定</h1>
      {room.role === "owner" && <LinkButton href={`/invite/${room.id}`} variant="soft">招待リンク</LinkButton>}
      <Card>
        <p>表示名・色・退出などの設定は、いま作っているところです。</p>
      </Card>
    </>
  );
}
