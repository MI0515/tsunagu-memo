"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, AppTitle, Button, Card, Field, Page } from "@/components/ui";
import { useCaptcha } from "@/components/captcha";
import { redeemIdentity, secretFromInput } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

// 引き継ぎコードを入力して、同じ本人として続きから使う（ホーム画面のアプリ・新しい端末用）
export default function HandoffPage() {
  const router = useRouter();
  const captcha = useCaptcha();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await redeemIdentity(secretFromInput(code), captcha.token);
      router.replace("/");
    } catch (err) {
      setError(errorMessage(err));
      captcha.reset();
      setBusy(false);
    }
  }

  return (
    <Page>
      <AppTitle sub="引き継ぎコード・復元リンクで続きから使う" />
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed">
            Safari（または前の端末）の「設定」で発行した引き継ぎコードを入力してください。保存しておいた復元リンクを、そのまま貼り付けても使えます。
          </p>
          <Field
            id="handoff-code"
            label="引き継ぎコード または 復元リンク"
            hint="例：ABCD-EFGH-JKLM（コードは10分間・1回だけ使えます）"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            required
          />
          {captcha.widget}
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={busy} disabled={code.trim().length < 12 || !captcha.ready}>引き継ぐ</Button>
        </form>
      </Card>
      <Link href="/" className="text-center text-sm text-primary underline underline-offset-4">もどる</Link>
    </Page>
  );
}
