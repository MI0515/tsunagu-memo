"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, LinkButton, Loading } from "@/components/ui";
import { useRoom } from "@/components/rooms";
import { listDays, type DaySummary } from "@/lib/api";
import { formatDayWithYear } from "@/lib/date";
import { errorMessage } from "@/lib/errors";
import { tapFeedback } from "@/lib/feedback";
import type { Member } from "@/lib/types";
import { useRealtime } from "@/lib/useRealtime";
import { useToday } from "@/lib/useToday";

// お気に入り（⭐）にした日の一覧。達成率やスタンプの数は出さない
export default function ReviewPage() {
  const { room } = useRoom();
  const today = useToday();
  const [data, setData] = useState<{ days: DaySummary[]; members: Member[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await listDays(room.id, { starredOnly: true }));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [room.id]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  useRealtime(room.id, ["day_stars", "reflections", "day_entries", "room_members"], load);

  const members = useMemo(() => new Map((data?.members ?? []).map((m) => [m.user_id, m])), [data?.members]);

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold">ふりかえり</h1>
        <p className="text-muted">お気に入りにした日</p>
      </div>

      {error && <Alert>{error}</Alert>}

      {!data ? (
        <Loading />
      ) : data.days.length === 0 ? (
        <>
          <section className="rounded-3xl border-2 border-dashed border-border p-6 text-center">
            <p className="text-lg">お気に入りにした日は、まだありません。</p>
            <p className="mt-1 text-muted">残しておきたい日に「お気に入り」を押すと、ここに並びます。</p>
          </section>
          <LinkButton href={`/day/${today}`} variant="soft">今日の振り返りを見る</LinkButton>
        </>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.days.map((day) => (
            <li key={day.date}>
              <Link
                href={`/day/${day.date}`}
                onClick={tapFeedback}
                className="flex items-center gap-3 rounded-3xl border-2 border-border bg-surface p-4 transition-transform active:scale-[0.98]"
              >
                <StarMark />
                <span className="flex-1">
                  <span className="block text-lg font-bold">{formatDayWithYear(day.date)}</span>
                  <span className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
                    {day.entry_count > 0 && <span>確認リスト {day.entry_count}項目</span>}
                    {day.reflection_authors.length > 0 && (
                      <span className="flex items-center gap-1">
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
                <span aria-hidden className="text-2xl text-muted">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function StarMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="shrink-0">
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
