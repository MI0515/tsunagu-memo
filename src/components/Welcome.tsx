"use client";

import Link from "next/link";
import { AppTitle, Alert, Card, LinkButton, Page } from "@/components/ui";

// まだどのルームにも入っていない人向けの画面
export function Welcome({ error }: { error?: string | null }) {
  return (
    <Page>
      <AppTitle sub="大切な人と、決めたことを一緒に確かめる" />
      {error && <Alert>{error}</Alert>}
      <Card className="flex flex-col gap-3">
        <p>
          大切にしたいことをメモにしておき、その日に確かめたいものを選んで、
          朝と夜にチェックするアプリです。チェックは、ルームのみんなにすぐ届きます。
        </p>
      </Card>
      <div className="flex flex-col gap-3">
        <LinkButton href="/create">ルームを作る</LinkButton>
        <p className="text-center text-muted">招待された方は、受け取った招待リンクを開いてください。</p>
      </div>
      <footer className="mt-auto text-center">
        <Link href="/notice" className="text-primary underline underline-offset-4">
          ご利用の前に（注意事項）
        </Link>
      </footer>
    </Page>
  );
}
