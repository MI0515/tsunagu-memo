"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Sheet } from "@/components/ui";
import { addItem } from "@/lib/api";
import { dayOfMonth, WEEKDAYS } from "@/lib/date";
import { errorMessage } from "@/lib/errors";
import { tapFeedback } from "@/lib/feedback";
import type { ItemKind } from "@/lib/types";

const KINDS: { kind: ItemKind; label: string }[] = [
  { kind: "once", label: "今日だけ" },
  { kind: "daily", label: "毎日" },
  { kind: "weekly", label: "曜日" },
  { kind: "monthly", label: "毎月" },
];

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => {
        tapFeedback();
        onClick();
      }}
      className={`min-h-12 rounded-2xl border-2 px-2 font-bold transition-colors active:scale-95 ${
        selected ? "border-primary bg-primary-soft text-text" : "border-border bg-bg text-muted"
      }`}
    >
      {children}
    </button>
  );
}

type Props = { roomId: string; today: string; nextPosition: number; onClose: () => void; onAdded: () => void };

export function AddItemSheet({ roomId, today, nextPosition, onClose, onAdded }: Props) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ItemKind>("once");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [monthDay, setMonthDay] = useState(dayOfMonth(today));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = title.trim() && (kind !== "weekly" || weekdays.length > 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addItem({
        room_id: roomId,
        title: title.trim(),
        kind,
        position: nextPosition,
        ...(kind === "once" && { date: today }),
        ...(kind === "weekly" && { weekdays }),
        ...(kind === "monthly" && { month_day: monthDay }),
      });
      onAdded();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet title="項目を追加" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Field
          id="item-title"
          label="やること"
          hint="例：朝、メモを確認する"
          maxLength={100}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          required
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 font-bold">いつ出す？</legend>
          <div className="grid grid-cols-4 gap-2">
            {KINDS.map((k) => (
              <Choice key={k.kind} selected={kind === k.kind} onClick={() => setKind(k.kind)}>
                {k.label}
              </Choice>
            ))}
          </div>
        </fieldset>

        {kind === "weekly" && (
          <fieldset>
            <legend className="mb-1.5 font-bold">曜日（いくつでも）</legend>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((label, d) => (
                <Choice
                  key={label}
                  selected={weekdays.includes(d)}
                  onClick={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))}
                >
                  {label}
                </Choice>
              ))}
            </div>
          </fieldset>
        )}

        {kind === "monthly" && (
          <label className="flex flex-col gap-1.5">
            <span className="font-bold">毎月何日？</span>
            <select
              value={monthDay}
              onChange={(e) => setMonthDay(Number(e.target.value))}
              className="min-h-14 rounded-2xl border-2 border-border bg-bg px-4 text-lg"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}日</option>
              ))}
            </select>
            {monthDay >= 29 && (
              <span className="text-sm text-muted">その日がない月は、月末に表示します。</span>
            )}
          </label>
        )}

        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} disabled={!valid}>追加する</Button>
      </form>
    </Sheet>
  );
}
