"use client";

import { useState } from "react";
import { Alert, Button, Card } from "@/components/ui";
import { useCaptcha } from "@/components/captcha";
import { saveLastRoom } from "@/lib/lastRoom";
import { startDemo } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

// デモ環境のはじめの画面：1タップで見本ルームを作って試せる
export function DemoStart() {
  const captcha = useCaptcha();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const roomId = await startDemo(captcha.token);
      saveLastRoom(roomId);
      // ルームの一覧を読み直すため、ページごと開き直す
      window.location.assign("/");
    } catch (e) {
      setError(errorMessage(e));
      captcha.reset();
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="leading-relaxed">
        あなた専用の見本ルームができます。「見本の相手」と一緒に使っている様子で、メモから選ぶ・☀️🌙を押す・振り返りを書く、を試せます。
      </p>
      {captcha.widget}
      {error && <Alert>{error}</Alert>}
      <Button onClick={start} loading={busy} disabled={!captcha.ready}>デモで試す</Button>
      <p className="text-xs text-muted">見本ルームは、作ってから24時間で自動的に消えます。</p>
    </Card>
  );
}
