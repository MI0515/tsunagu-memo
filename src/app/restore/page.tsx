"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AppTitle, Button, Card, Loading, Page } from "@/components/ui";
import { useCaptcha } from "@/components/captcha";
import { redeemIdentity, secretFromInput } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

// 復元リンクを開いた時の画面。開いただけでは復元せず、ボタンを押してから復元する
// （メッセージアプリのリンクのプレビューなどで、勝手に復元されないようにするため）
export default function RestorePage() {
  const router = useRouter();
  const captcha = useCaptcha();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = secretFromInput(window.location.hash.slice(1));
    setToken(/^[0-9a-f]{64}$/.test(t) ? t : null);
  }, []);

  async function restore() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await redeemIdentity(token, captcha.token);
      // 合言葉を、アドレスバーや履歴に残さない
      window.history.replaceState(null, "", "/restore");
      router.replace("/");
    } catch (e) {
      setError(errorMessage(e));
      captcha.reset();
      setBusy(false);
    }
  }

  if (token === undefined) return <Page><Loading /></Page>;

  return (
    <Page>
      <AppTitle sub="復元リンク" />
      {token === null ? (
        <Alert>このリンクは、復元リンクの形になっていません。リンクが途中で切れていないか確かめてください。</Alert>
      ) : (
        <Card className="flex flex-col gap-3">
          <p className="leading-relaxed">
            この端末で、復元リンクを発行したあなたとして、続きから使えるようにします。
          </p>
          <ul className="list-disc pl-5 text-sm leading-relaxed text-muted">
            <li>前に使っていた端末では、ルームが表示されなくなります。</li>
            <li>iPhoneでホーム画面のアプリを使う場合は、ここでは押さずに、リンクをコピーして、アプリの「引き継ぎコードを入力」に貼り付けてください。</li>
          </ul>
          {captcha.widget}
          {error && <Alert>{error}</Alert>}
          <Button onClick={restore} loading={busy} disabled={!captcha.ready}>この端末で復元する</Button>
        </Card>
      )}
      <Link href="/" className="text-center text-sm text-primary underline underline-offset-4">トップへ</Link>
    </Page>
  );
}
