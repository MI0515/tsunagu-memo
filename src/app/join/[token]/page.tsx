"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, AppTitle, Button, Card, Field, LinkButton, Loading, Page } from "@/components/ui";
import { useCaptcha } from "@/components/captcha";
import { saveLastRoom } from "@/components/rooms";
import { ensureSession, getInviteInfo, joinRoom } from "@/lib/api";
import { AppError, errorMessage } from "@/lib/errors";

type InviteState =
  | { status: "loading" }
  | { status: "ok"; roomName: string }
  | { status: "unusable"; message: string };

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const captcha = useCaptcha();
  const [invite, setInvite] = useState<InviteState>({ status: "loading" });
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getInviteInfo(token)
      .then((info) =>
        setInvite(
          info.expired
            ? { status: "unusable", message: errorMessage(new AppError("expired_invite")) }
            : { status: "ok", roomName: info.room_name },
        ),
      )
      .catch((e) => setInvite({ status: "unusable", message: errorMessage(e) }));
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await ensureSession(captcha.token);
      const { room_id } = await joinRoom(token, displayName.trim());
      saveLastRoom(room_id);
      router.replace("/");
    } catch (err) {
      setError(errorMessage(err));
      captcha.reset();
      setBusy(false);
    }
  }

  if (invite.status === "loading") return <Page><Loading /></Page>;

  if (invite.status === "unusable") {
    return (
      <Page>
        <AppTitle />
        <Alert>{invite.message}</Alert>
        <LinkButton href="/" variant="soft">トップへ</LinkButton>
      </Page>
    );
  }

  return (
    <Page>
      <AppTitle sub="招待が届いています" />
      <Card className="text-center">
        <p className="text-muted">参加するルーム</p>
        <p className="text-2xl font-bold">{invite.roomName}</p>
      </Card>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-5">
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
          {captcha.widget}
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={busy} disabled={!displayName.trim() || !captcha.ready}>
            参加する
          </Button>
          <p className="text-sm text-muted">
            参加すると、
            <Link href="/notice" className="text-primary underline underline-offset-4">注意事項</Link>
            に同意したものとします。
          </p>
        </form>
      </Card>
    </Page>
  );
}
