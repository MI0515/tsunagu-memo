"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Button, ConfirmSheet, Field, LinkButton, Loading, Sheet } from "@/components/ui";
import { useRoom } from "@/components/rooms";
import { addMemoItem, deleteMemo, deleteMemoItem, getMemo, renameMemo, updateMemoItem } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { copyText, tapFeedback } from "@/lib/feedback";
import { LIMITS, type Memo, type MemoItem } from "@/lib/types";
import { useRealtime } from "@/lib/useRealtime";

type Panel =
  | { kind: "add" }
  | { kind: "edit-item"; item: MemoItem; number: number }
  | { kind: "rename" }
  | { kind: "delete-memo" }
  | null;

export default function MemoPage() {
  const { memoId } = useParams<{ memoId: string }>();
  const { room } = useRoom();
  const router = useRouter();
  const [data, setData] = useState<{ memo: Memo; items: MemoItem[] } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getMemo(memoId));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [memoId]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime(room.id, ["memos", "memo_items"], load);

  // 上でルームを切り替えたら、そのルームのメモ一覧へ
  const firstRoom = useRef(room.id);
  useEffect(() => {
    if (room.id !== firstRoom.current) router.replace("/memos");
  }, [room.id, router]);

  async function copy(item: MemoItem) {
    if (await copyText(item.body)) {
      setCopiedId(item.id);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedId(null), 1500);
    }
  }

  if (data === undefined) return error ? <Alert>{error}</Alert> : <Loading />;
  if (data === null) {
    return (
      <>
        <Alert>このメモは見つかりませんでした。ほかの人が削除したのかもしれません。</Alert>
        <LinkButton href="/memos" variant="soft">メモ一覧へ</LinkButton>
      </>
    );
  }

  const { memo, items } = data;
  const nextPosition = Math.max(0, ...items.map((i) => i.position)) + 1;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Link href="/memos" className="min-h-11 py-2 text-primary">‹ メモ一覧</Link>
        <button
          onClick={() => {
            tapFeedback();
            setEditing((v) => !v);
          }}
          aria-pressed={editing}
          className={`min-h-11 rounded-full border-2 px-4 font-bold transition-colors active:scale-95 ${
            editing ? "border-primary bg-primary text-on-primary" : "border-border text-primary"
          }`}
        >
          {editing ? "編集を終える" : "編集する"}
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold leading-snug">{memo.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {editing ? "直したい項目をタップしてください。" : "項目をタップすると、コピーできます。"}
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      {items.length === 0 ? (
        <p className="rounded-3xl border-2 border-dashed border-border p-6 text-center text-muted">
          項目はまだありません。「編集する」から追加できます。
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((item, index) => {
            const copied = copiedId === item.id;
            return (
              <li key={item.id}>
                <button
                  onClick={() => {
                    tapFeedback();
                    if (editing) setPanel({ kind: "edit-item", item, number: index + 1 });
                    else copy(item);
                  }}
                  className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors active:scale-[0.99] ${
                    copied ? "border-primary bg-primary-soft" : editing ? "border-dashed border-border bg-bg" : "border-transparent bg-surface"
                  }`}
                >
                  <span className="min-w-[1.75rem] font-bold text-primary">{index + 1}.</span>
                  <span className="flex-1 leading-relaxed">{item.body}</span>
                  {copied && <span className="shrink-0 text-sm font-bold text-primary">✓ コピーしました</span>}
                  {editing && <span aria-hidden className="shrink-0 text-muted">✎</span>}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {editing && (
        <div className="flex flex-col gap-3">
          {items.length >= LIMITS.itemsPerMemo ? (
            <p className="text-center text-sm text-muted">1つのメモの項目は{LIMITS.itemsPerMemo}個までです。</p>
          ) : (
            <Button onClick={() => setPanel({ kind: "add" })}>＋ 項目を追加</Button>
          )}
          <Button variant="soft" onClick={() => setPanel({ kind: "rename" })}>見出しを変える</Button>
          <Button variant="ghost" onClick={() => setPanel({ kind: "delete-memo" })}>このメモを削除</Button>
        </div>
      )}

      {panel?.kind === "add" && (
        <AddItemSheet memo={memo} startPosition={nextPosition} count={items.length} onClose={() => setPanel(null)} onAdded={load} />
      )}
      {panel?.kind === "edit-item" && (
        <EditItemSheet item={panel.item} number={panel.number} onClose={() => setPanel(null)} onChanged={load} />
      )}
      {panel?.kind === "rename" && <RenameSheet memo={memo} onClose={() => setPanel(null)} onChanged={load} />}
      {panel?.kind === "delete-memo" && (
        <DeleteMemoSheet
          memo={memo}
          itemCount={items.length}
          onClose={() => setPanel(null)}
          onDeleted={() => router.replace("/memos")}
        />
      )}
    </>
  );
}

// 項目の追加。続けて書けるよう、追加しても閉じない
function AddItemSheet({ memo, startPosition, count, onClose, onAdded }: {
  memo: Memo;
  startPosition: number;
  count: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [body, setBody] = useState("");
  const [added, setAdded] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = count + added >= LIMITS.itemsPerMemo;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addMemoItem(memo, body.trim(), startPosition + added);
      setAdded((n) => n + 1);
      setBody("");
      onAdded();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="項目を追加" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          id="item-body"
          label={`${count + added + 1}. の内容`}
          hint="1〜2文の短い文がおすすめです"
          maxLength={LIMITS.memoItem}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          autoFocus
          disabled={full}
        />
        {added > 0 && <p className="font-bold text-primary">✓ {added}件追加しました。続けて書けます。</p>}
        {full && <p className="text-muted">このメモの項目は{LIMITS.itemsPerMemo}個までです。</p>}
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} disabled={!body.trim() || full}>追加する</Button>
        <Button type="button" variant="soft" onClick={onClose}>終わる</Button>
      </form>
    </Sheet>
  );
}

function EditItemSheet({ item, number, onClose, onChanged }: {
  item: MemoItem;
  number: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [body, setBody] = useState(item.body);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <ConfirmSheet
        title="項目を削除"
        message={
          <>
            <p className="mb-2 rounded-2xl bg-surface p-3">{number}. {item.body}</p>
            <p>この項目をメモから削除します。これまでの確認リストの記録は残ります。</p>
          </>
        }
        busy={busy}
        error={error}
        onConfirm={() => run(() => deleteMemoItem(item.id))}
        onCancel={() => setConfirming(false)}
      />
    );
  }

  return (
    <Sheet title={`${number}. を直す`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateMemoItem(item.id, body.trim()));
        }}
        className="flex flex-col gap-4"
      >
        <Field
          id="edit-item-body"
          label="内容"
          maxLength={LIMITS.memoItem}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          autoFocus
          required
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} disabled={!body.trim() || body.trim() === item.body}>保存する</Button>
        <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>この項目を削除</Button>
      </form>
    </Sheet>
  );
}

function RenameSheet({ memo, onClose, onChanged }: { memo: Memo; onClose: () => void; onChanged: () => void }) {
  const [title, setTitle] = useState(memo.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await renameMemo(memo.id, title.trim());
      onChanged();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet title="見出しを変える" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          id="memo-rename"
          label="見出し"
          maxLength={LIMITS.memoTitle}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          required
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} disabled={!title.trim() || title.trim() === memo.title}>保存する</Button>
      </form>
    </Sheet>
  );
}

function DeleteMemoSheet({ memo, itemCount, onClose, onDeleted }: {
  memo: Memo;
  itemCount: number;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteMemo(memo.id);
      onDeleted();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <ConfirmSheet
      title="メモを削除"
      message={
        <p>
          「{memo.title}」と、その中の{itemCount}項目を削除します。これまでの確認リストの記録は残ります。
        </p>
      }
      busy={busy}
      error={error}
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}
