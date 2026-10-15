"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Button, ConfirmSheet, EmptyState, Field, LinkButton, Loading, PageTitle, Phrases, Sheet, TextArea } from "@/components/ui";
import { MoveButtons, moveInList } from "@/components/MoveButtons";
import { useRoom } from "@/components/rooms";
import {
  addMemoItem, addToDay, deleteMemo, deleteMemoItem, deleteSet, getMemo, lastSelection, listSets, memoItemsInDays, moveMemoItem,
  saveSet, updateMemo, updateMemoItem, type MoveTo,
} from "@/lib/api";
import { addDays } from "@/lib/date";
import { errorMessage } from "@/lib/errors";
import { copyText, tapFeedback } from "@/lib/feedback";
import { LIMITS, type Memo, type MemoItem, type SelectionSet } from "@/lib/types";
import { useRealtime } from "@/lib/useRealtime";
import { useToday } from "@/lib/useToday";

type Mode = "read" | "select" | "edit";

type Panel =
  | { kind: "add" }
  | { kind: "edit-item"; item: MemoItem; number: number }
  | { kind: "rename" }
  | { kind: "delete-memo" }
  | { kind: "sets" }
  | null;

type Notice = { text: string; link?: { href: string; label: string } };

export default function MemoPage() {
  const { memoId } = useParams<{ memoId: string }>();
  const { room } = useRoom();
  const router = useRouter();
  const today = useToday();
  const tomorrow = addDays(today, 1);
  const [data, setData] = useState<{ memo: Memo; items: MemoItem[] } | null | undefined>(undefined);
  const [inDays, setInDays] = useState<{ date: string; memo_item_id: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("read");
  // 「編集する」の中で、直す（false）か並び替える（true）か
  const [sorting, setSorting] = useState(false);
  const [moving, setMoving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<"today" | "tomorrow" | "last" | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const [memo, days] = await Promise.all([getMemo(memoId), memoItemsInDays(room.id, [today, tomorrow])]);
      setData(memo);
      setInDays(days);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [memoId, room.id, today, tomorrow]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime(room.id, ["memos", "memo_items", "day_entries"], load);

  // 「今日」タブの「メモから選ぶ」から来た時は、はじめから選ぶ状態にする
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "select") setMode("select");
  }, []);

  // 上でルームを切り替えたら、そのルームのメモ一覧へ
  const firstRoom = useRef(room.id);
  useEffect(() => {
    if (room.id !== firstRoom.current) router.replace("/memos");
  }, [room.id, router]);

  // 並び替え：画面で先に動かして見せ、データベースで保存する。失敗したら読み直す
  async function move(itemId: string, to: MoveTo) {
    if (!data) return;
    setMoving(true);
    setError(null);
    setData({ ...data, items: moveInList(data.items, itemId, to) });
    try {
      await moveMemoItem(itemId, to);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setMoving(false);
      load();
    }
  }

  function changeMode(next: Mode) {
    setSorting(false);
    tapFeedback();
    setMode(next);
    setSelected(new Set());
    setNotice(null);
  }

  function flash(id: string) {
    setCopiedId(id);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 1500);
  }

  function toggleSelect(id: string) {
    setNotice(null);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
  const numberOf = new Map(items.map((item, index) => [item.id, index + 1]));
  const chosen = items.filter((i) => selected.has(i.id));

  async function add(which: "today" | "tomorrow") {
    setBusy(which);
    setError(null);
    try {
      const result = await addToDay(room.id, which === "today" ? today : tomorrow, chosen.map((i) => i.id));
      const label = which === "today" ? "今日" : "明日";
      const text =
        result.added > 0
          ? `${label}の確認リストに${result.added}件追加しました。` +
            (result.skipped > 0 ? `（${result.skipped}件は、すでに入っていました）` : "")
          : `選んだ項目は、すべて${label}の確認リストに入っています。`;
      setNotice({ text, link: { href: which === "today" ? "/" : "/?day=tomorrow", label: `${label}の確認リストを見る` } });
      setSelected(new Set());
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function selectLast() {
    tapFeedback();
    setBusy("last");
    setError(null);
    try {
      const last = new Set(await lastSelection(room.id));
      const here = items.filter((i) => last.has(i.id)).map((i) => i.id);
      setSelected(new Set(here));
      setNotice(here.length === 0 ? { text: "このメモには、前回選んだ項目がありません。" } : null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function copyChosen() {
    const text = chosen.map((i) => `${numberOf.get(i.id)}. ${i.body}`).join("\n");
    if (await copyText(text)) setNotice({ text: `選んだ${chosen.length}件をコピーしました。` });
  }

  const hint = {
    read: "項目をタップすると、コピーできます。",
    select: "思い出したい項目をタップして選んでください。",
    edit: sorting ? "⤒ いちばん上へ、↑↓ で1つずつ動かせます。番号は自動で振り直されます。" : "直したい項目をタップしてください。",
  }[mode];

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Link href="/memos" className="flex min-h-11 shrink-0 items-center whitespace-nowrap text-sm text-primary">‹ メモ一覧</Link>
        {mode === "read" ? (
          <div className="flex gap-2">
            <ModeButton onClick={() => changeMode("select")}>選ぶ</ModeButton>
            <ModeButton onClick={() => changeMode("edit")}>編集する</ModeButton>
          </div>
        ) : (
          <ModeButton active onClick={() => changeMode("read")}>{mode === "select" ? "選ぶのをやめる" : "編集を終える"}</ModeButton>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <PageTitle>{memo.title}</PageTitle>
        {memo.description && <p className="text-sm leading-relaxed">{memo.description}</p>}
        <p className="text-sm text-muted"><Phrases text={hint} /></p>
      </div>

      {error && <Alert>{error}</Alert>}

      {mode === "edit" && items.length > 1 && (
        <div role="group" aria-label="編集のしかた" className="grid grid-cols-2 rounded-full border-2 border-border p-0.5">
          {([[false, "直す"], [true, "並び替える"]] as const).map(([value, label]) => (
            <button
              key={label}
              onClick={() => {
                tapFeedback();
                setSorting(value);
              }}
              aria-pressed={sorting === value}
              className={`min-h-10 whitespace-nowrap rounded-full text-sm font-bold transition-colors ${
                sorting === value ? "bg-primary text-on-primary" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState title="項目は、まだありません。" body="「編集する」から追加できます。" />
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((item, index) => {
            const copied = copiedId === item.id;
            const isSelected = mode === "select" && selected.has(item.id);
            const days = inDays.filter((d) => d.memo_item_id === item.id).map((d) => (d.date === today ? "今日" : "明日"));
            if (mode === "edit" && sorting) {
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border-2 border-dashed border-border bg-bg px-3 py-2 text-[0.8824rem] leading-normal">
                  {/* 文に十分な幅（約12文字）がない時は、ボタンを下の段に回す */}
                  <span className="flex min-w-0 flex-1 basis-[12em] gap-2">
                    <span className="w-6 shrink-0 text-right font-bold text-primary tabular-nums">{index + 1}.</span>
                    <span className="min-w-0 flex-1">{item.body}</span>
                  </span>
                  <MoveButtons
                    label={item.body}
                    first={index === 0}
                    last={index === items.length - 1}
                    busy={moving}
                    onMove={(to) => move(item.id, to)}
                  />
                </li>
              );
            }
            return (
              <li key={item.id}>
                <button
                  onClick={async () => {
                    tapFeedback();
                    if (mode === "edit") setPanel({ kind: "edit-item", item, number: index + 1 });
                    else if (mode === "select") toggleSelect(item.id);
                    else if (await copyText(item.body)) flash(item.id);
                  }}
                  aria-pressed={mode === "select" ? isSelected : undefined}
                  className={`flex w-full items-start gap-2 rounded-2xl border-2 px-3 py-2 text-left text-[0.8824rem] leading-normal transition-colors active:scale-[0.99] ${
                    copied || isSelected
                      ? "border-primary bg-primary-soft"
                      : mode === "edit" ? "border-dashed border-border bg-bg" : "border-transparent bg-surface"
                  }`}
                >
                  {mode === "select" && <SelectMark on={isSelected} />}
                  <span className="w-6 shrink-0 text-right font-bold text-primary tabular-nums">{index + 1}.</span>
                  <span className="min-w-0 flex-1">
                    {item.body}
                    {(days.length > 0 || copied) && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {copied && <span className="whitespace-nowrap text-xs font-bold text-primary">✓ コピーしました</span>}
                        {days.sort().reverse().map((d) => (
                          <span key={d} className="whitespace-nowrap rounded-full bg-bg px-2 text-xs text-muted">{d}のリストに入っています</span>
                        ))}
                      </span>
                    )}
                  </span>
                  {mode === "edit" && <span aria-hidden className="shrink-0 text-muted">✎</span>}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {mode === "select" && items.length > 0 && (
        // 下のタブのすぐ上に固定。パネルはリストの後ろに並んでいるので、一番下までスクロールすれば最後の項目も隠れない
        <div className="sticky bottom-[calc(var(--tabbar-height)+env(safe-area-inset-bottom)+0.5rem)] z-20 -mx-1 flex flex-col gap-2 rounded-3xl border border-border bg-bg p-3 shadow-lg">
          {notice && (
            <div className="rounded-2xl bg-primary-soft px-3 py-2 text-sm">
              <p><Phrases text={notice.text} /></p>
              {notice.link && (
                <Link href={notice.link.href} className="inline-flex min-h-9 items-center font-bold text-primary underline underline-offset-4">
                  {notice.link.label}
                </Link>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="whitespace-nowrap text-sm font-bold">
              <span className="tabular-nums">{chosen.length}</span>件を選択中
            </p>
            <SmallButton onClick={() => setSelected(new Set())} disabled={chosen.length === 0}>選択を解除</SmallButton>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button className="whitespace-nowrap" onClick={() => add("today")} loading={busy === "today"} disabled={chosen.length === 0 || busy !== null}>
              今日に追加
            </Button>
            <Button className="whitespace-nowrap" variant="soft" onClick={() => add("tomorrow")} loading={busy === "tomorrow"} disabled={chosen.length === 0 || busy !== null}>
              明日に追加
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <SmallButton outline tight onClick={selectLast} disabled={busy !== null}>前回と同じ</SmallButton>
            <SmallButton outline tight onClick={() => setPanel({ kind: "sets" })} disabled={busy !== null}>セット</SmallButton>
            <SmallButton outline tight onClick={copyChosen} disabled={chosen.length === 0}>コピー</SmallButton>
          </div>
        </div>
      )}

      {mode === "edit" && !sorting && (
        <div className="flex flex-col gap-3">
          {items.length >= LIMITS.itemsPerMemo ? (
            <p className="text-center text-sm text-muted">1つのメモの項目は{LIMITS.itemsPerMemo}個までです。</p>
          ) : (
            <Button onClick={() => setPanel({ kind: "add" })}>＋ 項目を追加</Button>
          )}
          <Button variant="soft" onClick={() => setPanel({ kind: "rename" })}>見出しと説明を変える</Button>
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
      {panel?.kind === "sets" && (
        <SetsSheet
          roomId={room.id}
          items={items}
          selectedIds={chosen.map((i) => i.id)}
          onApply={(name, ids) => {
            setSelected(new Set(ids));
            setNotice({ text: `「${name}」の${ids.length}項目を選びました。` });
          }}
          onClose={() => setPanel(null)}
        />
      )}
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

function ModeButton({ active = false, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 whitespace-nowrap rounded-full border-2 px-3.5 text-sm font-bold transition-colors active:scale-95 ${
        active ? "border-primary bg-primary text-on-primary" : "border-border text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function SmallButton({ onClick, disabled, outline = false, tight = false, children }: {
  onClick: () => void;
  disabled?: boolean;
  outline?: boolean;
  // 3つ並べる時など、狭い所では左右の余白を小さくする
  tight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => {
        tapFeedback();
        onClick();
      }}
      disabled={disabled}
      className={`min-h-11 whitespace-nowrap rounded-full text-sm font-bold text-primary active:bg-surface disabled:opacity-40 ${tight ? "px-1" : "px-3"} ${
        outline ? "border-2 border-border" : ""
      }`}
    >
      {children}
    </button>
  );
}

// 選んだかどうかの印（丸）。選んだ時は塗りつぶして、中に小さな印
function SelectMark({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        on ? "border-primary bg-primary text-on-primary" : "border-border bg-bg"
      }`}
    >
      {on && (
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path d="M3 7.4 5.8 10 11 4.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
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
  const [description, setDescription] = useState(memo.description ?? "");
  const unchanged = title.trim() === memo.title && description.trim() === (memo.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateMemo(memo.id, title.trim(), description.trim());
      onChanged();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet title="見出しと説明を変える" onClose={onClose}>
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
        <TextArea
          id="memo-description"
          label="説明（なくても大丈夫）"
          hint="どんな時に読むメモか"
          maxLength={LIMITS.memoDescription}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} disabled={!title.trim() || unchanged}>保存する</Button>
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

// 名前を付けて保存したセット。いまの選び方を保存したり、保存したセットで選び直したりする
function SetsSheet({ roomId, items, selectedIds, onApply, onClose }: {
  roomId: string;
  items: MemoItem[];
  selectedIds: string[];
  onApply: (name: string, ids: string[]) => void;
  onClose: () => void;
}) {
  const [sets, setSets] = useState<SelectionSet[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SelectionSet | null>(null);
  const here = new Set(items.map((i) => i.id));

  const load = useCallback(async () => {
    try {
      setSets(await listSets(roomId));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [roomId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveSet(roomId, name.trim(), selectedIds);
      setName("");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (deleting) {
    return (
      <ConfirmSheet
        title="セットを削除"
        message={<p>「{deleting.name}」を削除します。メモの項目と、これまでの確認リストは消えません。</p>}
        busy={busy}
        error={error}
        onConfirm={async () => {
          setBusy(true);
          setError(null);
          try {
            await deleteSet(deleting.id);
            setDeleting(null);
            await load();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
        onCancel={() => setDeleting(null)}
      />
    );
  }

  const full = (sets?.length ?? 0) >= LIMITS.setsPerRoom;

  return (
    <Sheet title="保存したセット" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {selectedIds.length > 0 ? (
          full ? (
            <p className="text-sm text-muted">セットは{LIMITS.setsPerRoom}個までです。いらないセットを削除すると、保存できます。</p>
          ) : (
            <form onSubmit={save} className="flex flex-col gap-2 rounded-2xl bg-surface p-3">
              <Field
                id="set-name"
                label={`いま選んでいる${selectedIds.length}項目を保存`}
                hint="例：出張の日、週末"
                maxLength={LIMITS.setName}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit" loading={busy} disabled={!name.trim()}>名前を付けて保存</Button>
            </form>
          )
        ) : (
          <p className="rounded-2xl bg-surface p-3 text-sm text-muted">
            項目を選んでからここを開くと、その選び方に名前を付けて保存できます。
          </p>
        )}

        {error && <Alert>{error}</Alert>}

        {!sets ? (
          <Loading />
        ) : sets.length === 0 ? (
          <p className="text-sm text-muted">保存したセットは、まだありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sets.map((set) => {
              const inHere = set.item_ids.filter((id) => here.has(id));
              const elsewhere = set.item_ids.length - inHere.length;
              return (
                <li key={set.id} className="flex items-center gap-2 rounded-2xl border-2 border-border px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold leading-snug">{set.name}</span>
                    <span className="text-xs text-muted">
                      このメモの{inHere.length}項目{elsewhere > 0 && `（ほかのメモの${elsewhere}項目は、そのメモで選べます）`}
                    </span>
                  </span>
                  <button
                    onClick={() => {
                      tapFeedback();
                      onApply(set.name, inHere);
                      onClose();
                    }}
                    disabled={inHere.length === 0}
                    className="min-h-11 shrink-0 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-bold text-on-primary active:scale-95 disabled:opacity-40"
                  >
                    選ぶ
                  </button>
                  <button
                    onClick={() => {
                      tapFeedback();
                      setDeleting(set);
                    }}
                    aria-label={`「${set.name}」を削除`}
                    className="min-h-11 shrink-0 whitespace-nowrap rounded-full px-2 text-sm text-muted active:bg-surface"
                  >
                    削除
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
