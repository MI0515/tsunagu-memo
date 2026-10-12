"use client";

import { Card, LinkButton } from "@/components/ui";

// 今日の確認リスト（☀️🌙）は手順4で作る
export default function TodayPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">今日</h1>
      <Card className="flex flex-col gap-3">
        <p>☀️🌙の確認リストは、いま作っているところです。</p>
        <p className="text-muted">先に、メモを読んだり書いたりできます。</p>
      </Card>
      <LinkButton href="/memos" variant="soft">メモを見る</LinkButton>
    </>
  );
}
