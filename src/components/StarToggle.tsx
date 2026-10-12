"use client";

import { useState } from "react";
import { setStar } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { tapFeedback } from "@/lib/feedback";

// 日を「お気に入り」にする・解除する（保存先は⭐の記録）。
// 押した瞬間に見た目を変え、保存に失敗したら戻す
export function StarToggle({ roomId, date, starred, onChanged }: {
  roomId: string;
  date: string;
  starred: boolean;
  onChanged: (starred: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [presses, setPresses] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    tapFeedback();
    const next = !starred;
    setBusy(true);
    setError(null);
    setPresses((n) => n + 1);
    onChanged(next);
    try {
      await setStar(roomId, date, next);
    } catch (e) {
      onChanged(!next);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={toggle}
        disabled={busy}
        aria-pressed={starred}
        className={`flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 font-bold transition-colors active:scale-95 ${
          starred ? "border-[var(--star-line)] text-text" : "border-border text-muted"
        }`}
      >
        <StarIcon key={presses} filled={starred} animate={presses > 0 && starred} />
        {starred ? "お気に入り済み" : "お気に入り"}
      </button>
      {error && <p className="text-sm text-alert-text">{error}</p>}
    </div>
  );
}

// 星は1つだけ。お気に入りでない時は輪郭だけ、お気に入りの時は黄色で塗る
function StarIcon({ filled, animate }: { filled: boolean; animate: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className={animate ? "animate-pop" : undefined}>
      <path
        d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"
        fill={filled ? "var(--star-fill)" : "none"}
        stroke={filled ? "var(--star-line)" : "currentColor"}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
