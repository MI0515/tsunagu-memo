"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Alert, EmptyState, LinkButton, Loading, PageTitle } from "@/components/ui";
import { MemberName } from "@/components/MemberName";
import { useRoom } from "@/components/rooms";
import { listDays, searchRecords, type DaySummary, type SearchHit } from "@/lib/api";
import { addMonths, formatDayWithYear, formatMonth, monthOf, monthRange } from "@/lib/date";
import { errorMessage } from "@/lib/errors";
import { tapFeedback } from "@/lib/feedback";
import type { Member } from "@/lib/types";
import { useRealtime } from "@/lib/useRealtime";
import { useToday } from "@/lib/useToday";

type Mode = "starred" | "all";
type Saved = { mode: Mode; month: string | null; query: string };

// 日の画面を見て戻ってきた時に、選んでいた表示を続けられるようにする
const SAVE_KEY = "tsunagu:review";
function readSaved(): Saved {
  try {
    const raw = sessionStorage.getItem(SAVE_KEY);
    if (raw) return { mode: "starred", month: null, query: "", ...JSON.parse(raw) };
  } catch {
    // 読めない時は、はじめの表示にする
  }
  return { mode: "starred", month: null, query: "" };
}
function save(value: Saved) {
  try {
    sessionStorage.setItem(SAVE_KEY, JSON.stringify(value));
  } catch {
    // 保存できなくても、そのまま使える
  }
}

const SEARCH_TABLES = ["day_entries", "reflections", "reflection_notes", "day_stars", "room_members"];

export default function ReviewPage() {
  const { room } = useRoom();
  const today = useToday();
  const [saved, setSaved] = useState<Saved | null>(null);

  useEffect(() => {
    setSaved(readSaved());
  }, []);

  function update(next: Partial<Saved>) {
    setSaved((s) => {
      const value = { ...(s ?? readSaved()), ...next };
      save(value);
      return value;
    });
  }

  if (!saved) return <Loading />;
  const month = saved.month ?? monthOf(today);

  return (
    <>
      <PageTitle>ふりかえり</PageTitle>

      <SearchBox
        initial={saved.query}
        onSearch={(query) => update({ query })}
        onClear={() => update({ query: "" })}
      />

      {saved.query ? (
        <SearchResults roomId={room.id} query={saved.query} />
      ) : (
        <>
          <div role="group" aria-label="表示する日" className="grid grid-cols-2 rounded-full border-2 border-border p-0.5">
            {([["starred", "お気に入り"], ["all", "すべての日"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  tapFeedback();
                  update({ mode: key });
                }}
                aria-pressed={saved.mode === key}
                className={`min-h-10 whitespace-nowrap rounded-full text-sm font-bold transition-colors ${
                  saved.mode === key ? "bg-primary text-on-primary" : "text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {saved.mode === "starred" ? (
            <DayList roomId={room.id} options={STARRED} empty={<StarredEmpty today={today} />} />
          ) : (
            <MonthView roomId={room.id} month={month} thisMonth={monthOf(today)} onMonth={(m) => update({ month: m })} />
          )}
        </>
      )}
    </>
  );
}

const STARRED = { starredOnly: true };

function StarredEmpty({ today }: { today: string }) {
  return (
    <>
      <EmptyState title="お気に入りにした日は、まだありません。" body="「お気に入り」を押した日が、ここに並びます。" />
      <LinkButton href={`/day/${today}`} variant="soft">今日の振り返りを見る</LinkButton>
    </>
  );
}

// 月ごとの一覧。「‹ 2026年10月 ›」で月を移り、日付を指定して開くこともできる
function MonthView({ roomId, month, thisMonth, onMonth }: {
  roomId: string;
  month: string;
  thisMonth: string;
  onMonth: (month: string) => void;
}) {
  const router = useRouter();
  const { from, to } = monthRange(month);
  const options = useMemo(() => ({ from, to }), [from, to]);
  const atLatest = month >= thisMonth;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <StepButton label="前の月" onClick={() => onMonth(addMonths(month, -1))}>‹</StepButton>
        <p className="font-bold tabular-nums">{formatMonth(month)}</p>
        <StepButton label="次の月" onClick={() => onMonth(addMonths(month, 1))} disabled={atLatest}>›</StepButton>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-3 py-2 text-sm">
        <span className="shrink-0 text-muted">日付を指定して開く</span>
        <input
          type="date"
          className="min-h-10 min-w-0 rounded-xl border-2 border-border bg-bg px-2 text-base"
          onChange={(e) => {
            if (e.target.value) router.push(`/day/${e.target.value}`);
          }}
        />
      </label>
      <DayList roomId={roomId} options={options} empty={<EmptyState title={`${formatMonth(month)}の記録は、ありません。`} />} />
    </>
  );
}

function StepButton({ label, onClick, disabled, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        tapFeedback();
        onClick();
      }}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-border text-xl text-primary active:scale-95 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

// 記録のある日の一覧（お気に入り・月ごとの両方で使う）。達成率やスタンプの数は出さない
function DayList({ roomId, options, empty }: {
  roomId: string;
  options: { starredOnly?: boolean; from?: string; to?: string };
  empty: React.ReactNode;
}) {
  const [data, setData] = useState<{ days: DaySummary[]; members: Member[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await listDays(roomId, options));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [roomId, options]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  useRealtime(roomId, ["day_stars", "reflections", "day_entries", "room_members"], load);

  const members = useMemo(() => new Map((data?.members ?? []).map((m) => [m.user_id, m])), [data?.members]);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Loading />;
  if (data.days.length === 0) return <>{empty}</>;

  return (
    <ul className="flex flex-col gap-2">
      {data.days.map((day) => (
        <li key={day.date}>
          <Link
            href={`/day/${day.date}`}
            onClick={tapFeedback}
            className="flex items-center gap-3 rounded-3xl border-2 border-border bg-surface px-4 py-3 transition-transform active:scale-[0.98]"
          >
            {day.starred ? <StarMark /> : <span className="w-5 shrink-0" aria-hidden />}
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{formatDayWithYear(day.date)}</span>
              <span className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
                {day.entry_count > 0 && <span className="whitespace-nowrap">確認リスト {day.entry_count}項目</span>}
                {day.reflection_authors.length > 0 && (
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    振り返り
                    {day.reflection_authors.map((id) => {
                      const m = members.get(id);
                      const name = m && !m.left_at ? m.display_name : "退出したメンバー";
                      return (
                        <span key={id} role="img" aria-label={name} title={name}>
                          {m && !m.left_at ? m.emoji : "👤"}
                        </span>
                      );
                    })}
                  </span>
                )}
              </span>
            </span>
            <span aria-hidden className="shrink-0 text-xl text-muted">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SearchBox({ initial, onSearch, onClear }: { initial: string; onSearch: (q: string) => void; onClear: () => void }) {
  const [value, setValue] = useState(initial);

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (q) onSearch(q);
  }

  return (
    <form role="search" onSubmit={submit} className="flex gap-2">
      <input
        type="search"
        enterKeyHint="search"
        aria-label="記録を言葉で探す"
        placeholder="言葉で探す（例：連絡）"
        value={value}
        maxLength={50}
        onChange={(e) => {
          setValue(e.target.value);
          if (!e.target.value) onClear();
        }}
        className="min-h-11 min-w-0 flex-1 rounded-full border-2 border-border bg-bg px-4 text-base outline-none focus:border-primary"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="min-h-11 shrink-0 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-bold text-on-primary active:scale-95 disabled:opacity-50"
      >
        探す
      </button>
    </form>
  );
}

const KIND_LABEL = { entry: "確認リスト", reflection: "振り返り", note: "追記" } as const;

function SearchResults({ roomId, query }: { roomId: string; query: string }) {
  const [data, setData] = useState<{ hits: SearchHit[]; members: Member[]; capped: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await searchRecords(roomId, query));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [roomId, query]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  useRealtime(roomId, SEARCH_TABLES, load);

  const members = useMemo(() => new Map((data?.members ?? []).map((m) => [m.user_id, m])), [data?.members]);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Loading />;
  if (data.hits.length === 0) {
    return <EmptyState title={`「${query}」は、見つかりませんでした。`} body="ほかの言葉でも探してみてください。" />;
  }

  return (
    <section className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        「{query}」が見つかった記録：{data.hits.length}件{data.capped && "（新しいものから表示しています）"}
      </p>
      <ul className="flex flex-col gap-2">
        {data.hits.map((hit) => (
          <li key={hit.key}>
            <Link
              href={`/day/${hit.date}`}
              onClick={tapFeedback}
              className="block rounded-2xl border-2 border-border bg-surface px-3 py-2.5 transition-transform active:scale-[0.98]"
            >
              <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-bold">{formatDayWithYear(hit.date)}</span>
                <span className="text-muted">{KIND_LABEL[hit.kind]}</span>
                {hit.author_id && <MemberName member={members.get(hit.author_id)} />}
              </span>
              <span className="mt-1 block leading-relaxed">
                <Highlight text={snippet(hit.body, query)} query={query} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// 見つかった言葉のまわりだけを切り出す（長い振り返りでも一目で分かるように）
function snippet(text: string, query: string, around = 40) {
  const flat = text.replace(/\s+/g, " ");
  const i = flat.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0 || flat.length <= around * 2) return flat;
  const start = Math.max(0, i - around);
  const end = Math.min(flat.length, i + query.length + around);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

// 見つかった言葉に、淡い空色の印を付ける
function Highlight({ text, query }: { text: string; query: string }) {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: { s: string; hit: boolean }[] = [];
  let from = 0;
  for (let i = lower.indexOf(q); i >= 0 && q; i = lower.indexOf(q, i + q.length)) {
    if (i > from) parts.push({ s: text.slice(from, i), hit: false });
    parts.push({ s: text.slice(i, i + q.length), hit: true });
    from = i + q.length;
  }
  if (from < text.length) parts.push({ s: text.slice(from), hit: false });
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded bg-primary-soft px-0.5 font-bold text-text">{p.s}</mark>
        ) : (
          <span key={i}>{p.s}</span>
        ),
      )}
    </>
  );
}

function StarMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-label="お気に入り" className="shrink-0">
      <path
        d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"
        fill="var(--star-fill)"
        stroke="var(--star-line)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
