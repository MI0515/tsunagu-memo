"use client";

import { tapFeedback } from "@/lib/feedback";
import type { MoveTo } from "@/lib/api";

// 並び替えのボタン：⤒ いちばん上へ／↑ 1つ上へ／↓ 1つ下へ。どれも44px四方で押しやすく
export function MoveButtons({ label, first, last, busy, onMove }: {
  label: string;
  first: boolean;
  last: boolean;
  busy?: boolean;
  onMove: (to: MoveTo) => void;
}) {
  const buttons: { to: MoveTo; mark: string; name: string; disabled: boolean }[] = [
    { to: "top", mark: "⤒", name: "いちばん上へ", disabled: first },
    { to: "up", mark: "↑", name: "1つ上へ", disabled: first },
    { to: "down", mark: "↓", name: "1つ下へ", disabled: last },
  ];
  return (
    <span className="flex shrink-0 gap-1">
      {buttons.map((b) => (
        <button
          key={b.to}
          type="button"
          disabled={b.disabled || busy}
          aria-label={`「${label}」を${b.name}`}
          onClick={(e) => {
            e.stopPropagation();
            tapFeedback();
            onMove(b.to);
          }}
          className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-border bg-bg text-lg font-bold text-primary active:scale-95 disabled:opacity-30"
        >
          {b.mark}
        </button>
      ))}
    </span>
  );
}

// 画面の上で、先に並べ替えて見せる（保存は、そのあとデータベースで行う）
export function moveInList<T extends { id: string }>(list: T[], id: string, to: MoveTo): T[] {
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return list;
  const next = [...list];
  if (to === "top" && i > 0) next.unshift(...next.splice(i, 1));
  if (to === "up" && i > 0) [next[i - 1], next[i]] = [next[i], next[i - 1]];
  if (to === "down" && i < next.length - 1) [next[i + 1], next[i]] = [next[i], next[i + 1]];
  return next;
}
