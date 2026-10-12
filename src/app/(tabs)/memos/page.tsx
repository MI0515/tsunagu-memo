"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, Button, EmptyState, Field, Loading, PageTitle, Phrases, Sheet } from "@/components/ui";
import { useRoom } from "@/components/rooms";
import { createMemo, listMemos } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { tapFeedback } from "@/lib/feedback";
import { LIMITS, type MemoSummary } from "@/lib/types";
import { useRealtime } from "@/lib/useRealtime";

export default function MemosPage() {
  const { room } = useRoom();
  const [memos, setMemos] = useState<MemoSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    setSelecting(new URLSearchParams(window.location.search).get("mode") === "select");
  }, []);

  const load = useCallback(async () => {
    try {
      setMemos(await listMemos(room.id));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [room.id]);

  useEffect(() => {
    setMemos(null);
    load();
  }, [load]);

  useRealtime(room.id, ["memos", "memo_items"], load);

  const full = (memos?.length ?? 0) >= LIMITS.memosPerRoom;
  const nextPosition = Math.max(0, ...(memos ?? []).map((m) => m.position)) + 1;

  return (
    <>
      <PageTitle>メモ</PageTitle>
      {selecting && (
        <p className="rounded-2xl bg-primary-soft px-4 py-3 text-sm"><Phrases text="思い出したい項目があるメモを開いて、選んでください。" /></p>
      )}
      {error && <Alert>{error}</Alert>}

      {!memos ? (
        <Loading />
      ) : memos.length === 0 ? (
        <EmptyState title="メモは、まだありません。" body="下のボタンから作れます。" />
      ) : (
        <ul className="flex flex-col gap-3">
          {memos.map((memo) => (
            <li key={memo.id}>
              <Link
                href={`/memos/${memo.id}${selecting ? "?mode=select" : ""}`}
                onClick={tapFeedback}
                className="flex items-center gap-3 rounded-3xl border-2 border-border bg-surface px-4 py-3.5 transition-transform active:scale-[0.98]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-bold leading-snug">{memo.title}</span>
                  <span className="text-sm text-muted">{memo.item_count}項目</span>
                </span>
                <span aria-hidden className="shrink-0 text-xl text-muted">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {memos && (
        full ? (
          <p className="text-center text-sm text-muted">メモは{LIMITS.memosPerRoom}個までです。</p>
        ) : (
          <Button variant="soft" onClick={() => setCreating(true)}>＋ メモを作る</Button>
        )
      )}

      {creating && (
        <CreateMemoSheet roomId={room.id} position={nextPosition} onClose={() => setCreating(false)} />
      )}
    </>
  );
}

function CreateMemoSheet({ roomId, position, onClose }: { roomId: string; position: number; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await createMemo(roomId, title.trim(), position);
      router.push(`/memos/${id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet title="メモを作る" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Field
          id="memo-title"
          label="見出し"
          hint="例：大切にしたいこと"
          maxLength={LIMITS.memoTitle}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          required
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} disabled={!title.trim()}>作る</Button>
      </form>
    </Sheet>
  );
}
