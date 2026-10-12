"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Alert, Button, ConfirmSheet, Loading, Sheet, TextArea } from "@/components/ui";
import { MemberName } from "@/components/MemberName";
import { useRoom } from "@/components/rooms";
import { StampIcon, type Slot } from "@/components/Stamp";
import { StarToggle } from "@/components/StarToggle";
import {
  addNote, deleteNote, deleteReflection, loadDay, loadReflections, updateNote, updateReflection, writeReflection,
} from "@/lib/api";
import { formatDay, formatTime } from "@/lib/date";
import { errorMessage } from "@/lib/errors";
import { tapFeedback } from "@/lib/feedback";
import {
  NOTE_MAX, REFLECTION_MAX, type Check, type DayEntry, type Member, type Reflection, type ReflectionNote,
} from "@/lib/types";
import { useRealtime } from "@/lib/useRealtime";
import { useToday } from "@/lib/useToday";

type DayData = { entries: DayEntry[]; checks: Check[]; members: Member[]; starred: boolean; reflections: Reflection[] };

type Panel =
  | { kind: "write"; reflection?: Reflection }
  | { kind: "delete-reflection"; reflection: Reflection }
  | { kind: "note"; reflection: Reflection; note?: ReflectionNote }
  | { kind: "delete-note"; note: ReflectionNote }
  | null;

const SLOTS: { slot: Slot; icon: string; name: string }[] = [
  { slot: "morning", icon: "☀️", name: "朝" },
  { slot: "night", icon: "🌙", name: "夜" },
];

const HINTS = ["大事にしたかったこと", "できたこと", "改善を実感したこと"];

// 書いた人の色（退出した人は灰色）。名前と細い線にだけ使い、本文は通常の文字色
function colorOf(member: Member | undefined) {
  return member && !member.left_at && member.color ? `var(--member-${member.color})` : "var(--member-left)";
}

export default function DayPage() {
  const { date } = useParams<{ date: string }>();
  const { room, myId } = useRoom();
  const today = useToday();
  const [data, setData] = useState<DayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);

  const load = useCallback(async () => {
    if (!validDate) return;
    try {
      const [day, reflections] = await Promise.all([loadDay(room.id, date), loadReflections(room.id, date)]);
      setData({ ...day, reflections });
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [room.id, date, validDate]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  useRealtime(room.id, ["day_entries", "checks", "room_members", "day_stars", "reflections", "reflection_notes"], load);

  const members = useMemo(() => new Map((data?.members ?? []).map((m) => [m.user_id, m])), [data?.members]);

  if (!validDate) return <Alert>日付の形が正しくありません。</Alert>;

  const mine = data?.reflections.find((r) => r.author_id === myId);
  const backHref = date === today ? "/" : "/review";

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Link href={backHref} className="min-h-11 py-2 text-primary">‹ {date === today ? "今日" : "ふりかえり"}</Link>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">{formatDay(date)}</h1>
        {data && (
          <StarToggle
            roomId={room.id}
            date={date}
            starred={data.starred}
            onChanged={(starred) => setData((d) => (d ? { ...d, starred } : d))}
          />
        )}
      </div>

      {error && <Alert>{error}</Alert>}

      {!data ? (
        <Loading />
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-bold">確認リスト</h2>
            {data.entries.length === 0 ? (
              <p className="text-muted">この日の確認リストはありません。</p>
            ) : (
              <div className="rounded-3xl border border-border bg-surface px-3 pt-2 pb-1">
                <div className="flex justify-end gap-1 pr-1 text-center text-sm text-muted">
                  {SLOTS.map((s) => <span key={s.slot} className="w-12">{s.icon}</span>)}
                </div>
                <ul>
                  {data.entries.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-1 border-t border-border py-2">
                      <span className="flex-1 pl-1 leading-snug">{entry.body}</span>
                      {SLOTS.map((s) => {
                        const checks = data.checks.filter((c) => c.entry_id === entry.id && c.slot === s.slot);
                        const isMine = checks.some((c) => c.user_id === myId);
                        return (
                          <span key={s.slot} className="flex w-12 flex-col items-center" aria-label={`${s.name}：${checks.length}人`}>
                            <StampIcon slot={s.slot} state={isMine ? "mine" : checks.length > 0 ? "others" : "none"} size={28} />
                            <span className="h-4 text-xs leading-4 text-muted">{checks.length || ""}</span>
                          </span>
                        );
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-bold">振り返り</h2>
              <p className="text-sm text-muted">書かなくても大丈夫です。書きたい日に、書きたいことだけ。</p>
            </div>

            {data.reflections.map((reflection) => (
              <ReflectionCard
                key={reflection.id}
                reflection={reflection}
                members={members}
                myId={myId}
                onEdit={() => setPanel({ kind: "write", reflection })}
                onDelete={() => setPanel({ kind: "delete-reflection", reflection })}
                onAddNote={() => setPanel({ kind: "note", reflection })}
                onEditNote={(note) => setPanel({ kind: "note", reflection, note })}
                onDeleteNote={(note) => setPanel({ kind: "delete-note", note })}
              />
            ))}

            {!mine && (
              <Button variant="soft" onClick={() => setPanel({ kind: "write" })}>振り返りを書く</Button>
            )}
          </section>
        </>
      )}

      {panel?.kind === "write" && (
        <ReflectionSheet roomId={room.id} date={date} reflection={panel.reflection} onClose={() => setPanel(null)} onSaved={load} />
      )}
      {panel?.kind === "note" && (
        <NoteSheet reflection={panel.reflection} note={panel.note} members={members} onClose={() => setPanel(null)} onSaved={load} />
      )}
      {panel?.kind === "delete-reflection" && (
        <DeleteSheet
          title="振り返りを削除"
          message={`あなたの振り返りを削除します。${
            panel.reflection.reflection_notes.length > 0
              ? `ついている追記（${panel.reflection.reflection_notes.length}件）も一緒に消えます。`
              : ""
          }`}
          action={() => deleteReflection(panel.reflection.id)}
          onClose={() => setPanel(null)}
          onDone={load}
        />
      )}
      {panel?.kind === "delete-note" && (
        <DeleteSheet
          title="追記を削除"
          message="あなたの追記を削除します。"
          action={() => deleteNote(panel.note.id)}
          onClose={() => setPanel(null)}
          onDone={load}
        />
      )}
    </>
  );
}

function ReflectionCard({ reflection, members, myId, onEdit, onDelete, onAddNote, onEditNote, onDeleteNote }: {
  reflection: Reflection;
  members: Map<string, Member>;
  myId: string;
  onEdit: () => void;
  onDelete: () => void;
  onAddNote: () => void;
  onEditNote: (note: ReflectionNote) => void;
  onDeleteNote: (note: ReflectionNote) => void;
}) {
  const author = members.get(reflection.author_id);
  const isMine = reflection.author_id === myId;
  return (
    <article className="rounded-3xl border border-border bg-surface p-4" style={{ borderLeft: `2px solid ${colorOf(author)}` }}>
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <MemberName member={author} />
        <span className="text-xs text-muted">
          {formatTime(reflection.created_at)}
          {reflection.updated_at !== reflection.created_at && "（直しました）"}
        </span>
      </header>
      <p className="whitespace-pre-wrap leading-relaxed">{reflection.body}</p>
      {isMine && (
        <div className="mt-2 flex gap-2">
          <SmallButton onClick={onEdit}>直す</SmallButton>
          <SmallButton onClick={onDelete}>削除</SmallButton>
        </div>
      )}

      {reflection.reflection_notes.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          {reflection.reflection_notes.map((note) => {
            const writer = members.get(note.author_id);
            return (
              <li key={note.id} className="rounded-2xl bg-bg px-3 py-2" style={{ borderLeft: `2px solid ${colorOf(writer)}` }}>
                <p className="text-sm">
                  <MemberName member={writer} />
                  <span className="text-muted">　追記 {formatTime(note.created_at)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">{note.body}</p>
                {note.author_id === myId && (
                  <div className="mt-1 flex gap-2">
                    <SmallButton onClick={() => onEditNote(note)}>直す</SmallButton>
                    <SmallButton onClick={() => onDeleteNote(note)}>削除</SmallButton>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <button
        onClick={() => {
          tapFeedback();
          onAddNote();
        }}
        className="mt-3 min-h-11 font-bold text-primary"
      >
        ＋ 追記する
      </button>
    </article>
  );
}

function SmallButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={() => {
        tapFeedback();
        onClick();
      }}
      className="min-h-11 rounded-full px-3 text-sm font-bold text-primary active:bg-bg"
    >
      {children}
    </button>
  );
}

// 振り返りを書く・直す。見出しをタップすると、その見出しが入る
function ReflectionSheet({ roomId, date, reflection, onClose, onSaved }: {
  roomId: string;
  date: string;
  reflection?: Reflection;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [body, setBody] = useState(reflection?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function insertHeading(heading: string) {
    tapFeedback();
    setBody((b) => {
      const sep = b.length === 0 ? "" : b.endsWith("\n\n") ? "" : b.endsWith("\n") ? "\n" : "\n\n";
      return `${b}${sep}【${heading}】\n`;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (reflection) await updateReflection(reflection.id, body.trim());
      else await writeReflection(roomId, date, body.trim());
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet title={reflection ? "振り返りを直す" : "振り返りを書く"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" aria-label="見出しを入れる">
          {HINTS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => insertHeading(h)}
              className="min-h-11 rounded-full border-2 border-border px-3 text-sm font-bold text-primary active:scale-95"
            >
              ＋ {h}
            </button>
          ))}
        </div>
        <TextArea
          id="reflection-body"
          label="振り返り"
          hint="見出しは使っても、使わなくても大丈夫です"
          maxLength={REFLECTION_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          autoFocus
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} disabled={!body.trim() || body.trim() === reflection?.body}>保存する</Button>
      </form>
    </Sheet>
  );
}

function NoteSheet({ reflection, note, members, onClose, onSaved }: {
  reflection: Reflection;
  note?: ReflectionNote;
  members: Map<string, Member>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [body, setBody] = useState(note?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const author = members.get(reflection.author_id);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (note) await updateNote(note.id, body.trim());
      else await addNote(reflection, body.trim());
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet title={note ? "追記を直す" : "追記する"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="max-h-40 overflow-y-auto rounded-2xl bg-surface p-3 text-sm">
          <MemberName member={author} />
          <p className="mt-1 whitespace-pre-wrap">{reflection.body}</p>
        </div>
        <TextArea
          id="note-body"
          label="追記"
          hint="読んで思ったことを、書き添えてください"
          maxLength={NOTE_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          autoFocus
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} disabled={!body.trim() || body.trim() === note?.body}>保存する</Button>
      </form>
    </Sheet>
  );
}

function DeleteSheet({ title, message, action, onClose, onDone }: {
  title: string;
  message: string;
  action: () => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ConfirmSheet
      title={title}
      message={<p>{message}</p>}
      busy={busy}
      error={error}
      onConfirm={async () => {
        setBusy(true);
        setError(null);
        try {
          await action();
          onDone();
          onClose();
        } catch (e) {
          setError(errorMessage(e));
          setBusy(false);
        }
      }}
      onCancel={onClose}
    />
  );
}
