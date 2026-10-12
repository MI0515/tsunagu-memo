"use client";

import { useState } from "react";
import { setStar } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { tapFeedback } from "@/lib/feedback";

// 日に⭐を付ける・外す。押した瞬間に見た目を変え、保存に失敗したら戻す
export function StarToggle({ roomId, date, starred, onChanged }: {
  roomId: string;
  date: string;
  starred: boolean;
  onChanged: (starred: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    tapFeedback();
    const next = !starred;
    setBusy(true);
    setError(null);
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
          starred ? "border-primary bg-primary-soft text-text" : "border-border text-muted"
        }`}
      >
        <span aria-hidden className={starred ? "animate-pop" : "opacity-50 grayscale"}>⭐</span>
        {starred ? "⭐を付けた日" : "⭐を付ける"}
      </button>
      {error && <p className="text-sm text-alert-text">{error}</p>}
    </div>
  );
}
