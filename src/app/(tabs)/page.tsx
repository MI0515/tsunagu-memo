"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Alert, Button, ConfirmSheet, EmptyState, Field, LinkButton, Loading, PageTitle, Phrases, Sheet } from "@/components/ui";
import { InstallHint } from "@/components/InstallGuide";
import { MemberName } from "@/components/MemberName";
import { useRoom } from "@/components/rooms";
import { StampButton, type Slot } from "@/components/Stamp";
import { StarToggle } from "@/components/StarToggle";
import { addAdhocEntry, addCheck, deleteEntry, loadDay, removeCheck } from "@/lib/api";
import { addDays, formatDay, formatTime } from "@/lib/date";
import { errorMessage } from "@/lib/errors";
import { tapFeedback } from "@/lib/feedback";
import { ENTRY_MAX, type Check, type DayEntry, type Member } from "@/lib/types";
import { useRealtime } from "@/lib/useRealtime";
import { useToday } from "@/lib/useToday";

type Day = { entries: DayEntry[]; checks: Check[]; members: Member[]; starred: boolean };

const SLOTS: { slot: Slot; icon: string; name: string }[] = [
  { slot: "morning", icon: "☀️", name: "朝" },
  { slot: "night", icon: "🌙", name: "夜" },
];

export default function TodayPage() {
  const { room, myId } = useRoom();
  const today = useToday();
  const [which, setWhich] = useState<"today" | "tomorrow">("today");
  const date = which === "today" ? today : addDays(today, 1);
  const [day, setDay] = useState<Day | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [addingAdhoc, setAddingAdhoc] = useState(false);

  const load = useCallback(async () => {
    try {
      setDay(await loadDay(room.id, date));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [room.id, date]);

  useEffect(() => {
    setDay(null);
    load();
  }, [load]);

  useRealtime(room.id, ["day_entries", "checks", "room_members"], load);

  // メモから「明日に追加」したあとは、明日の確認リストを開く
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("day") === "tomorrow") setWhich("tomorrow");
  }, []);

  const members = useMemo(() => new Map((day?.members ?? []).map((m) => [m.user_id, m])), [day?.members]);

  // スタンプは押した瞬間に画面へ反映し、保存に失敗したら元に戻す
  async function toggle(entry: DayEntry, slot: Slot) {
    if (!day) return;
    setError(null);
    const key = { entry_id: entry.id, slot, user_id: myId };
    const before = day.checks;
    const mine = before.some((c) => c.entry_id === entry.id && c.slot === slot && c.user_id === myId);
    setDay({
      ...day,
      checks: mine
        ? before.filter((c) => !(c.entry_id === entry.id && c.slot === slot && c.user_id === myId))
        : [...before, { ...key, room_id: room.id, date: entry.date, created_at: new Date().toISOString() }],
    });
    try {
      if (mine) await removeCheck(key);
      else await addCheck({ ...key, room_id: room.id, date: entry.date });
    } catch (e) {
      setDay((d) => (d ? { ...d, checks: before } : d));
      setError(errorMessage(e));
    }
  }

  const openEntry = day?.entries.find((e) => e.id === openEntryId);
  const isToday = which === "today";

  return (
    <>
      <InstallHint />
      <div className="flex items-center justify-between gap-3">
        <PageTitle sub={formatDay(date)}>{isToday ? "今日" : "明日"}</PageTitle>
        <div role="group" aria-label="表示する日" className="flex shrink-0 rounded-full border-2 border-border p-0.5">
          {(["today", "tomorrow"] as const).map((w) => (
            <button
              key={w}
              onClick={() => {
                tapFeedback();
                setWhich(w);
                setOpenEntryId(null);
              }}
              aria-pressed={which === w}
              className={`min-h-10 whitespace-nowrap rounded-full px-3.5 text-sm font-bold transition-colors ${
                which === w ? "bg-primary text-on-primary" : "text-muted"
              }`}
            >
              {w === "today" ? "今日" : "明日"}
            </button>
          ))}
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {!day ? (
        <Loading />
      ) : day.entries.length === 0 ? (
        <EmptyState
          title={`${isToday ? "今日" : "明日"}の確認リストは、まだ空です。`}
          body="メモから、思い出したいことを選んでください。"
        />
      ) : (
        <section className="rounded-3xl border border-border bg-surface px-2 pt-1.5 pb-1">
          {isToday ? (
            <div className="flex justify-end text-center text-xs text-muted">
              {SLOTS.map((s) => <span key={s.slot} className="w-12 whitespace-nowrap">{s.icon} {s.name}</span>)}
            </div>
          ) : (
            <p className="px-2 py-1.5 text-sm text-muted"><Phrases text="☀️🌙は、明日になったら押せます。" /></p>
          )}
          <ul>
            {day.entries.map((entry) => (
              <li key={entry.id} className="flex items-center border-t border-border py-1">
                <button
                  onClick={() => {
                    tapFeedback();
                    setOpenEntryId(entry.id);
                  }}
                  className="min-h-12 min-w-0 flex-1 py-2 pr-1 pl-2 text-left leading-snug"
                >
                  {entry.body}
                </button>
                {isToday && SLOTS.map((s) => {
                  const checks = day.checks.filter((c) => c.entry_id === entry.id && c.slot === s.slot);
                  return (
                    <StampButton
                      key={s.slot}
                      slot={s.slot}
                      count={checks.length}
                      mine={checks.some((c) => c.user_id === myId)}
                      label={`「${entry.body}」の${s.name}`}
                      onPress={() => toggle(entry, s.slot)}
                    />
                  );
                })}
              </li>
            ))}
          </ul>
        </section>
      )}

      {day && isToday && (
        <div className="grid grid-cols-2 gap-2">
          <StarToggle
            block
            roomId={room.id}
            date={date}
            starred={day.starred}
            onChanged={(starred) => setDay((d) => (d ? { ...d, starred } : d))}
          />
          <Link
            href={`/day/${date}`}
            onClick={tapFeedback}
            className="flex min-h-11 items-center justify-center whitespace-nowrap rounded-full border-2 border-border px-4 text-sm font-bold text-primary active:scale-95"
          >
            振り返り ›
          </Link>
        </div>
      )}

      {day && (
        <div className="flex flex-col items-center gap-1">
          <LinkButton href="/memos?mode=select">メモから選ぶ</LinkButton>
          <button
            onClick={() => {
              tapFeedback();
              setAddingAdhoc(true);
            }}
            className="min-h-11 px-4 text-sm text-primary underline underline-offset-4"
          >
            ＋ その日だけの項目
          </button>
        </div>
      )}

      {openEntry && day && (
        <EntrySheet
          entry={openEntry}
          checks={day.checks.filter((c) => c.entry_id === openEntry.id)}
          members={members}
          onClose={() => setOpenEntryId(null)}
          onDeleted={load}
        />
      )}
      {addingAdhoc && (
        <AdhocSheet roomId={room.id} date={date} dayLabel={isToday ? "今日" : "明日"} onClose={() => setAddingAdhoc(false)} onAdded={load} />
      )}
    </>
  );
}

// 項目をタップした時：だれがいつ押したか。確認リストからの削除
function EntrySheet({ entry, checks, members, onClose, onDeleted }: {
  entry: DayEntry;
  checks: Check[];
  members: Map<string, Member>;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteEntry(entry.id);
      onDeleted();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <ConfirmSheet
        title="確認リストから削除"
        message={
          <>
            <p className="mb-2 rounded-2xl bg-surface p-3">{entry.body}</p>
            <p>この日の確認リストから削除します。押されたスタンプも消えます。メモの項目はそのまま残ります。</p>
          </>
        }
        busy={busy}
        error={error}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    );
  }

  return (
    <Sheet title="だれがいつ押したか" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="rounded-2xl bg-surface p-3 leading-relaxed">{entry.body}</p>
        {SLOTS.map((s) => {
          const list = checks.filter((c) => c.slot === s.slot);
          return (
            <section key={s.slot}>
              <h3 className="mb-1 font-bold">{s.icon} {s.name}</h3>
              {list.length === 0 ? (
                <p className="text-sm text-muted">まだだれも押していません。</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {list.map((c) => (
                    <li key={c.user_id}>
                      <MemberName member={members.get(c.user_id)} />
                      <span className="text-muted">　{formatTime(c.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        <Button variant="ghost" onClick={() => setConfirming(true)}>確認リストから削除</Button>
      </div>
    </Sheet>
  );
}

function AdhocSheet({ roomId, date, dayLabel, onClose, onAdded }: {
  roomId: string;
  date: string;
  dayLabel: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addAdhocEntry(roomId, date, body.trim());
      onAdded();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet title={`${dayLabel}だけの項目`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          id="adhoc-body"
          label="思い出したいこと"
          hint="例：今日は19時ごろに一度連絡する"
          maxLength={ENTRY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          autoFocus
          required
        />
        <p className="text-sm text-muted">この日の確認リストにだけ入ります。メモには残りません。</p>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} disabled={!body.trim()}>追加する</Button>
      </form>
    </Sheet>
  );
}
