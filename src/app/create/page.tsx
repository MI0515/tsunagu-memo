"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, AppTitle, Button, Card, Field, Loading, Page } from "@/components/ui";
import { useCaptcha } from "@/components/captcha";
import { saveLastRoom } from "@/lib/lastRoom";
import { createRoom, ensureSession, getAppInfo } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

export default function CreateRoomPage() {
  const router = useRouter();
  const captcha = useCaptcha();
  const [needsCode, setNeedsCode] = useState<boolean | null>(null);
  const [roomName, setRoomName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAppInfo()
      .then((info) => setNeedsCode(info.requires_creation_code))
      .catch((e) => {
        setError(errorMessage(e));
        setNeedsCode(true);
      });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await ensureSession(captcha.token);
      const { room_id } = await createRoom(roomName.trim(), displayName.trim(), needsCode ? code.trim() : null);
      saveLastRoom(room_id);
      router.replace(`/invite/${room_id}?new=1`);
    } catch (err) {
      setError(errorMessage(err));
      captcha.reset();
      setBusy(false);
    }
  }

  if (needsCode === null) return <Page><Loading /></Page>;

  const canSubmit = roomName.trim() && displayName.trim() && (!needsCode || code.trim()) && captcha.ready;

  return (
    <Page>
      <AppTitle sub="ルームを作る" />
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <Field
            id="room-name"
            label="ルームの名前"
            hint="例：ふたりのメモ、家族"
            maxLength={30}
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            required
          />
          <Field
            id="display-name"
            label="あなたの表示名"
            hint="スタンプを押した人として表示されます"
            maxLength={20}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="nickname"
            required
          />
          {needsCode && (
            <Field
              id="creation-code"
              label="作成用コード"
              hint="運営者から受け取ったコード"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              required
            />
          )}
          {captcha.widget}
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={busy} disabled={!canSubmit}>
            このルームを作る
          </Button>
          <p className="text-sm text-muted">
            作ると、
            <Link href="/notice" className="text-primary underline underline-offset-4">注意事項</Link>
            に同意したものとします。
          </p>
        </form>
      </Card>
      <Link href="/" className="text-center text-primary underline underline-offset-4">もどる</Link>
    </Page>
  );
}
