"use client";

import { useId, useState } from "react";
import { tapFeedback } from "@/lib/feedback";

// 確認リストのスタンプ「きらめきの印」（シール寄り）。
// ☀️朝は空色、🌙夜はラベンダー。達成ではなく「思い出した・振り返った」の印。
//   0人         ：点線の輪郭だけ
//   ほかの人だけ：実線の輪郭＋淡い塗り（きらめきなし）
//   自分が押した：ぷっくりした塗り＋光沢＋小さなきらめき
export type Slot = "morning" | "night";
export type StampState = "none" | "others" | "mine";

// 角の間にくびれのある、やわらかい4つ角の光（⭐の5つ角とは別の形）
function glintPath(cx: number, cy: number, r: number, roundness: number) {
  const k = r * roundness;
  return `M${cx} ${cy - r}Q${cx + k} ${cy - k} ${cx + r} ${cy}Q${cx + k} ${cy + k} ${cx} ${cy + r}Q${cx - k} ${cy + k} ${cx - r} ${cy}Q${cx - k} ${cy - k} ${cx} ${cy - r}Z`;
}

const BODY = glintPath(23, 25, 14.5, 0.4);
const GLOSS = "M20.2 19.2Q21.6 16.4 23 13.6";
const SPARKLE = glintPath(36.8, 11.8, 4.8, 0.34);

const PALETTE = {
  morning: { line: "var(--st-line)", soft: "var(--st-line-soft)", a: "var(--st-fill-a)", b: "var(--st-fill-b)", c: "var(--st-fill-c)" },
  night: { line: "var(--st-lav-line)", soft: "var(--st-lav-soft)", a: "var(--st-lav-a)", b: "var(--st-lav-b)", c: "var(--st-lav-c)" },
};

export function StampIcon({ slot, state, size = 30, animate = false }: {
  slot: Slot;
  state: StampState;
  size?: number;
  animate?: boolean;
}) {
  const gradient = `stamp-${useId().replace(/:/g, "")}`;
  const c = PALETTE[slot];
  const mine = state === "mine";

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className={animate ? "stamp-pop" : undefined} style={{ overflow: "visible" }}>
      {mine && (
        <>
          <defs>
            <linearGradient id={gradient} x1="0.15" y1="0.05" x2="0.85" y2="0.95">
              <stop offset="0" stopColor={c.a} />
              <stop offset="0.55" stopColor={c.b} />
              <stop offset="1" stopColor={c.c} />
            </linearGradient>
          </defs>
          {/* シールの縁 */}
          <path d={BODY} fill="var(--st-halo)" stroke="var(--st-halo)" strokeWidth={5} strokeLinejoin="round" />
        </>
      )}
      <path
        d={BODY}
        fill={state === "none" ? "transparent" : mine ? `url(#${gradient})` : c.a}
        stroke={state === "none" ? "var(--st-empty)" : mine ? c.line : c.soft}
        strokeWidth={mine ? 1.3 : 2}
        strokeDasharray={state === "none" ? "3.2 3.4" : undefined}
        strokeLinejoin="round"
      />
      {mine && (
        <>
          <path d={GLOSS} fill="none" stroke="var(--st-gloss)" strokeWidth={2.4} strokeLinecap="round" opacity={0.85} />
          <path
            className={animate ? "stamp-twinkle" : undefined}
            style={{ transformOrigin: "36.8px 11.8px" }}
            d={SPARKLE}
            fill="var(--st-sparkle)"
            stroke={c.line}
            strokeWidth={1}
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}

// 押せるスタンプ欄。下に押した人数（0人の時は何も出さない）
export function StampButton({ slot, count, mine, label, onPress }: {
  slot: Slot;
  count: number;
  mine: boolean;
  label: string;
  onPress: () => void;
}) {
  // 押すたびに数字を変えて、動きをやり直す
  const [presses, setPresses] = useState(0);
  const state: StampState = mine ? "mine" : count > 0 ? "others" : "none";
  const description = mine
    ? `あなたは押しています（${count}人）`
    : count > 0
      ? `ほかのメンバー${count}人が押しています`
      : "まだだれも押していません";

  return (
    <button
      type="button"
      onClick={() => {
        tapFeedback();
        setPresses((n) => n + 1);
        onPress();
      }}
      aria-pressed={mine}
      aria-label={`${label}：${description}`}
      className="flex min-h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl py-1 active:scale-95"
    >
      <StampIcon key={presses} slot={slot} state={state} animate={presses > 0 && mine} />
      <span
        className="h-4 text-xs leading-4 tabular-nums"
        style={{ color: mine ? PALETTE[slot].line : "var(--muted)", fontWeight: mine ? 700 : 400 }}
      >
        {count > 0 ? count : ""}
      </span>
    </button>
  );
}
