"use client";

import Link from "next/link";
import { AppTitle, Alert, Card, LinkButton, Page, Phrases } from "@/components/ui";
import { DemoBanner } from "@/components/DemoBanner";
import { DemoStart } from "@/components/DemoStart";
import { FirstRunGuide } from "@/components/FirstRunGuide";
import { IS_DEMO } from "@/lib/appMode";
import { useDevice } from "@/lib/device";

// まだどのルームにも入っていない人向けの画面
export function Welcome({ error }: { error?: string | null }) {
  const device = useDevice();
  return (
    <Page>
      <FirstRunGuide />
      <DemoBanner />
      <AppTitle sub="大切にしたいことを、一緒に思い出す" />
      {error && <Alert>{error}</Alert>}
      <Card className="flex flex-col gap-3">
        <p className="leading-relaxed">
          大切にしたいことをメモにしておき、その日に思い出したいものを選んで、朝に読み、夜に振り返るためのアプリです。
          押したスタンプは、ルームのみんなにすぐ届きます。
        </p>
      </Card>
      {IS_DEMO && <DemoStart />}
      {/* ホーム画面のアプリとして開いた時は、引き継ぎを一番上に出す */}
      {device?.standalone && (
        <Card className="flex flex-col gap-3">
          <p className="font-bold"><Phrases text="Safariで参加済みの方は、引き継ぎコードを入力してください。" /></p>
          <LinkButton href="/handoff">引き継ぎコードを入力</LinkButton>
        </Card>
      )}
      <div className="flex flex-col gap-3">
        <LinkButton href="/create" variant={device?.standalone || IS_DEMO ? "soft" : "primary"}>
          {IS_DEMO ? "空のルームを作る" : "ルームを作る"}
        </LinkButton>
        <p className="text-center text-sm text-muted"><Phrases text="招待された方は、受け取った招待リンクを開いてください。" /></p>
        {!device?.standalone && (
          <Link href="/handoff" className="text-center text-sm text-primary underline underline-offset-4">
            引き継ぎコード・復元リンクをお持ちの方
          </Link>
        )}
      </div>
      <footer className="mt-auto text-center">
        <Link href="/notice" className="text-primary underline underline-offset-4">
          ご利用の前に（注意事項）
        </Link>
      </footer>
    </Page>
  );
}
