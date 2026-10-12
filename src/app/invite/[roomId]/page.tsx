"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Alert, AppTitle, Button, Card, LinkButton, Loading, Page } from "@/components/ui";
import { getActiveInvite, inviteUrl, listMyRooms, regenerateInvite, type ActiveInvite, type MyRoom } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { copyText } from "@/lib/feedback";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function InviteContent() {
  const { roomId } = useParams<{ roomId: string }>();
  const isNew = useSearchParams().get("new") === "1";
  const [room, setRoom] = useState<MyRoom | null | undefined>(undefined);
  const [invite, setInvite] = useState<ActiveInvite | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const mine = (await listMyRooms()).find((r) => r.id === roomId) ?? null;
      setRoom(mine);
      if (mine?.role === "owner") setInvite(await getActiveInvite(roomId));
    } catch (e) {
      setError(errorMessage(e));
      setRoom(null);
    }
  }, [roomId]);

  useEffect(() => {
    load();
  }, [load]);

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      await regenerateInvite(roomId);
      await load();
      setConfirming(false);
      setCopied(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (room === undefined) return <Loading />;
  if (room === null) {
    return <Alert>{error ?? "このルームの情報を見ることができません。"}</Alert>;
  }
  if (room.role !== "owner") {
    return <Alert>招待リンクは、ルームの作成者だけが表示できます。</Alert>;
  }

  const url = invite ? inviteUrl(invite.token) : null;
  const shareText = `つなぐメモのルーム「${room.name}」への招待です。下のリンクを開いて参加してください。`;
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <>
      {isNew && (
        <Card className="text-center">
          <p className="text-lg font-bold leading-snug">ルーム「{room.name}」ができました</p>
          <p className="mt-1 text-muted">一緒に使う人に、招待リンクを送りましょう。</p>
        </Card>
      )}
      <Card className="flex flex-col gap-4">
        <h1 className="text-[1.0625rem] font-bold">招待リンク</h1>
        {url && invite ? (
          <>
            <p className="break-all rounded-2xl bg-bg p-4 text-sm text-muted">{url}</p>
            <p className="text-muted">有効期限：{formatDate(invite.expires_at)}まで</p>
            <Button
              onClick={async () => setCopied(await copyText(`${shareText}\n${url}`))}
              className={copied ? "!bg-primary-soft !text-text" : ""}
            >
              {copied ? "✓ コピーしました" : "リンクをコピー"}
            </Button>
            {canShare && (
              <Button variant="soft" onClick={() => navigator.share({ text: shareText, url }).catch(() => {})}>
                LINEなどで送る
              </Button>
            )}
            <p className="text-sm text-muted">
              このリンクを知っている人は、期限内ならだれでも参加できます。送る相手を間違えないようにしてください。
            </p>
          </>
        ) : (
          <p>いま使える招待リンクはありません。新しく作ってください。</p>
        )}
        {error && <Alert>{error}</Alert>}
        {confirming ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-bg p-4">
            <p>新しいリンクを作ると、いまのリンクは使えなくなります。作りますか？</p>
            <Button onClick={regenerate} loading={busy}>新しいリンクを作る</Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>やめる</Button>
          </div>
        ) : (
          <Button variant="soft" onClick={() => (url ? setConfirming(true) : regenerate())} loading={busy}>
            {url ? "リンクを作り直す" : "招待リンクを作る"}
          </Button>
        )}
      </Card>
    </>
  );
}

export default function InvitePage() {
  return (
    <Page>
      <AppTitle />
      <Suspense fallback={<Loading />}>
        <InviteContent />
      </Suspense>
      <LinkButton href="/" variant="soft">ホームへ</LinkButton>
    </Page>
  );
}
