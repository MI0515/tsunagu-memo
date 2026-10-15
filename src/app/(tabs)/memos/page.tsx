"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, Button, EmptyState, Field, Loading, PageTitle, Phrases, Sheet, TextArea } from "@/components/ui";
import { useRoom } from "@/components/rooms";
import { MoveButtons, moveInList } from "@/components/MoveButtons";
import { createMemo, listMemos, moveMemo, type MoveTo } from "@/lib/api";
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
  const [sorting, setSorting] = useState(false);
  const [moving, setMoving] = useState(false);

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

  // 並び替え：画面で先に動かして見せ、データベースで保存する。失敗したら読み直す
  async function move(memoId: string, to: MoveTo) {
    if (!memos) return;
    setMoving(true);
    setError(null);
    setMemos(moveInList(memos, memoId, to));
    try {
      await moveMemo(memoId, to);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setMoving(false);
      load();
    }
  }

  const full = (memos?.length ?? 0) >= LIMITS.memosPerRoom;
  const nextPosition = Math.max(0, ...(memos ?? []).map((m) => m.position)) + 1;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <PageTitle>メモ</PageTitle>
        {memos && memos.length > 1 && !selecting && (
          <button
            onClick={() => {
              tapFeedback();
              setSorting((v) => !v);
            }}
            aria-pressed={sorting}
            className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border-2 px-3.5 text-sm font-bold transition-colors active:scale-95 ${
              sorting ? "border-primary bg-primary text-on-primary" : "border-border text-primary"
            }`}
          >
            {sorting ? "並び替えを終える" : "並び替え"}
          </button>
        )}
      </div>
      {sorting && (
        <p className="text-sm text-muted">⤒ いちばん上へ、↑↓ で1つずつ動かせます。</p>
      )}
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
          {memos.map((memo, index) => (
            <li key={memo.id}>
              {sorting ? (
                <div className="flex flex-wrap items-center justify-end gap-2 rounded-3xl border-2 border-dashed border-border bg-bg px-4 py-3">
                  {/* 見出しに十分な幅がない時は、ボタンを下の段に回す */}
                  <span className="min-w-0 flex-1 basis-[9em] font-bold leading-snug">{memo.title}</span>
                  <MoveButtons
                    label={memo.title}
                    first={index === 0}
                    last={index === memos.length - 1}
                    busy={moving}
                    onMove={(to) => move(memo.id, to)}
                  />
                </div>
              ) : (
              <Link
                href={`/memos/${memo.id}${selecting ? "?mode=select" : ""}`}
                onClick={tapFeedback}
                className="flex items-center gap-3 rounded-3xl border-2 border-border bg-surface px-4 py-3.5 transition-transform active:scale-[0.98]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-bold leading-snug">{memo.title}</span>
                  {memo.description && (
                    <span className="mt-0.5 line-clamp-2 block text-sm leading-snug text-muted">{memo.description}</span>
                  )}
                  <span className="text-sm text-muted">{memo.item_count}項目</span>
                </span>
                <span aria-hidden className="shrink-0 text-xl text-muted">›</span>
              </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {memos && !sorting && (
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
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await createMemo(roomId, title.trim(), description.trim(), position);
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
        <TextArea
          id="memo-description"
          label="説明（なくても大丈夫）"
          hint="どんな時に読むメモか"
          maxLength={LIMITS.memoDescription}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} disabled={!title.trim()}>作る</Button>
      </form>
    </Sheet>
  );
}
