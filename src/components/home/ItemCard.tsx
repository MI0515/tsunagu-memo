"use client";

import { useState } from "react";
import { formatTime, WEEKDAYS } from "@/lib/date";
import { tapFeedback } from "@/lib/feedback";
import { STAMPS, type Item, type Stamp, type StampKind } from "@/lib/types";

export function repeatLabel(item: Item): string | null {
  switch (item.kind) {
    case "daily":
      return "毎日";
    case "weekly":
      return `毎週 ${[...(item.weekdays ?? [])].sort().map((d) => WEEKDAYS[d]).join("・")}`;
    case "monthly":
      return `毎月${item.month_day}日`;
    default:
      return null;
  }
}

type Props = {
  item: Item;
  stamps: Stamp[];
  names: Map<string, string>;
  myId: string;
  onToggle: (kind: StampKind) => void;
  onOpen: () => void;
};

export function ItemCard({ item, stamps, names, myId, onToggle, onOpen }: Props) {
  const done = stamps.some((s) => s.kind === "check");
  const repeat = repeatLabel(item);

  return (
    <li
      className={`rounded-3xl border-2 p-4 transition-colors ${
        done ? "border-primary bg-primary-soft" : "border-border bg-surface"
      }`}
    >
      <button onClick={onOpen} className="flex w-full items-start gap-2 text-left">
        <span className="flex-1">
          {repeat && <span className="mb-1 block text-sm text-muted">{repeat}</span>}
          <span className="text-lg font-bold leading-snug">{item.title}</span>
        </span>
        <span aria-hidden className="pt-1 text-muted">›</span>
      </button>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {STAMPS.map((s) => (
          <StampButton
            key={s.kind}
            emoji={s.emoji}
            label={s.label}
            count={stamps.filter((x) => x.kind === s.kind).length}
            mine={stamps.some((x) => x.kind === s.kind && x.user_id === myId)}
            onPress={() => onToggle(s.kind)}
          />
        ))}
      </div>

      {stamps.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
          {stamps.map((s) => (
            <span key={`${s.user_id}-${s.kind}`}>
              {STAMPS.find((x) => x.kind === s.kind)?.emoji}
              {names.get(s.user_id) ?? "退出したメンバー"} {formatTime(s.created_at)}
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

function StampButton({ emoji, label, count, mine, onPress }: {
  emoji: string;
  label: string;
  count: number;
  mine: boolean;
  onPress: () => void;
}) {
  // 押すたびに数字を変えて、絵文字の「ぽんっ」という動きをやり直す
  const [presses, setPresses] = useState(0);
  return (
    <button
      onClick={() => {
        tapFeedback();
        setPresses((n) => n + 1);
        onPress();
      }}
      aria-pressed={mine}
      aria-label={`${label}${mine ? "（押しています）" : ""}`}
      className={`flex min-h-14 flex-col items-center justify-center rounded-2xl border-2 transition-colors active:scale-95 ${
        mine ? "border-primary bg-bg" : "border-transparent bg-bg/60"
      }`}
    >
      <span key={presses} className={`text-2xl leading-none ${presses ? "animate-pop" : ""}`}>{emoji}</span>
      <span className={`mt-1 text-xs ${mine ? "font-bold text-primary" : "text-muted"}`}>
        {count > 0 ? count : label}
      </span>
    </button>
  );
}
