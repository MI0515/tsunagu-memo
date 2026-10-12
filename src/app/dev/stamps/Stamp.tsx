"use client";

import { useId } from "react";

// スタンプの試作（開発用）。A：芽、B：丸いシール、C：きらめきの印
export type Motif = "sprout" | "round" | "glint";
export type Texture = "line" | "sticker";
export type StampState = "none" | "others" | "mine";
export type Slot = "morning" | "night";

type Props = {
  motif: Motif;
  texture: Texture;
  state: StampState;
  slot?: Slot;
  // true：朝は空色、夜はラベンダー。false：朝夜とも空色
  splitTint?: boolean;
  size?: number;
  // 押した瞬間だけ true にすると、ぽんっと動き、きらめきが光る
  animate?: boolean;
};

// 4つの角を丸めた、ぷっくりしたきらめき（⭐の5つ角とは違う形）
// roundness を 0.5 に近づけるほど、角の間のくびれが浅くなる（0.5 でひし形）
function sparklePath(cx: number, cy: number, r: number, roundness = 0.34) {
  const k = r * roundness;
  return `M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} Q${cx + k} ${cy + k} ${cx} ${cy + r} Q${cx - k} ${cy + k} ${cx - r} ${cy} Q${cx - k} ${cy - k} ${cx} ${cy - r}Z`;
}

// モチーフの形（48×48 の中に描く）
const SHAPES: Record<Motif, { body: string[]; stem?: string; gloss: string; sparkle: [number, number, number] }> = {
  // A：双葉。葉は2枚だけ、茎は短く
  sprout: {
    body: [
      "M24 27C16.8 27.4 11.6 22.6 11.4 15.6C18.4 15.2 23.6 19.8 24 27Z",
      "M24 23.5C24.4 16 29.2 11.2 36.6 11.2C36.8 18.4 31.6 23.4 24 23.5Z",
    ],
    stem: "M24 38.5C24 33.5 24 29 24 24",
    gloss: "M15.2 17.4C17.4 17.8 19.4 19 20.8 20.8M27.4 17.6C28.8 15.8 30.8 14.6 33 14.4",
    sparkle: [37.5, 31, 5],
  },
  // B：ぷっくりした丸いシール
  round: {
    body: ["M24 10A14 14 0 1 1 23.99 10Z"],
    gloss: "M15.4 20.4A9.4 9.4 0 0 1 21 14.6",
    sparkle: [34.5, 13.5, 4.6],
  },
  // C：丸みのある光の印＋小さな反射
  glint: {
    body: [sparklePath(23, 25, 14.5, 0.4)],
    gloss: "M20.2 19.2Q21.6 16.4 23 13.6",
    sparkle: [36.8, 11.8, 4.8],
  },
};

export function StampIcon({ motif, texture, state, slot = "morning", splitTint = false, size = 36, animate }: Props) {
  const id = useId().replace(/:/g, "");
  const shape = SHAPES[motif];
  const night = splitTint && slot === "night";
  // 色はすべて CSS 変数から取る（ライト・ダークで切り替わる）
  const c = night
    ? { line: "var(--st-lav-line)", soft: "var(--st-lav-soft)", a: "var(--st-lav-a)", b: "var(--st-lav-b)", deep: "var(--st-lav-c)" }
    : { line: "var(--st-line)", soft: "var(--st-line-soft)", a: "var(--st-fill-a)", b: "var(--st-fill-b)", deep: "var(--st-fill-c)" };
  // 芽は、葉先にミントを少しだけ混ぜる
  const accent = motif === "sprout" ? { a: "var(--st-mint-b)", b: c.b } : null;

  const gradient = `g${id}`;
  const isMine = state === "mine";
  const isSticker = texture === "sticker";

  // 状態ごとの塗りと線
  const fill =
    state === "none" ? "transparent"
      : state === "others" ? c.a
      : isSticker ? `url(#${gradient})`
      : c.a;
  const stroke = state === "none" ? "var(--st-empty)" : state === "others" ? c.soft : c.line;
  const strokeWidth = state === "mine" ? (isSticker ? 1.3 : 2.4) : 2;
  const dash = state === "none" ? "3.2 3.4" : undefined;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
      className={animate ? "stamp-pop" : undefined}
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id={gradient} x1="0.15" y1="0.05" x2="0.85" y2="0.95">
          <stop offset="0" stopColor={accent?.a ?? c.a} />
          <stop offset="0.55" stopColor={accent?.b ?? c.b} />
          <stop offset="1" stopColor={c.deep} />
        </linearGradient>
      </defs>

      {/* シール寄り・自分が押した時：白いふちどり（切り抜いたシールの縁） */}
      {isMine && isSticker && (
        <g fill="var(--st-halo)" stroke="var(--st-halo)" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round">
          {shape.body.map((d) => <path key={d} d={d} />)}
          {shape.stem && <path d={shape.stem} fill="none" strokeWidth={7} />}
        </g>
      )}

      {shape.stem && (
        <path
          d={shape.stem}
          fill="none"
          stroke={stroke}
          strokeWidth={isMine && isSticker ? 2.6 : strokeWidth}
          strokeDasharray={dash}
          strokeLinecap="round"
        />
      )}
      {shape.body.map((d) => (
        <path
          key={d}
          d={d}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
          strokeLinejoin="round"
        />
      ))}

      {/* 自分が押した時だけ：やさしい光沢と、小さなきらめき1つ */}
      {isMine && (
        <>
          {isSticker && (
            <path d={shape.gloss} fill="none" stroke="var(--st-gloss)" strokeWidth={2.4} strokeLinecap="round" opacity={0.85} />
          )}
          <path
            className={animate ? "stamp-twinkle" : undefined}
            style={{ transformOrigin: `${shape.sparkle[0]}px ${shape.sparkle[1]}px` }}
            d={sparklePath(...shape.sparkle)}
            fill={isSticker ? "var(--st-sparkle)" : c.a}
            stroke={c.line}
            strokeWidth={isSticker ? 1 : 1.6}
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}

// スタンプ欄：押せるボタン＋下に人数
export function StampButton({
  label,
  count,
  mine,
  animateKey,
  onPress,
  ...icon
}: Omit<Props, "state" | "animate"> & {
  label: string;
  count: number;
  mine: boolean;
  animateKey?: number;
  onPress?: () => void;
}) {
  const state: StampState = mine ? "mine" : count > 0 ? "others" : "none";
  const description = mine
    ? `あなたは押しています。合計${count}人`
    : count > 0
      ? `ほかのメンバー${count}人が押しています。あなたはまだです`
      : "まだだれも押していません";
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={mine}
      aria-label={`${label}：${description}`}
      className="flex min-h-14 min-w-14 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1 active:scale-95"
    >
      <StampIcon key={animateKey} {...icon} state={state} animate={!!animateKey && mine} />
      <span
        className="h-4 text-xs leading-4 tabular-nums"
        style={{ color: mine ? "var(--st-line)" : "var(--pv-muted)", fontWeight: mine ? 700 : 400 }}
      >
        {count > 0 ? count : ""}
      </span>
    </button>
  );
}

// 試作で使う色（ライト・ダーク）と、押した時の動き
export const STAMP_STYLES = `
.stamp-light, .stamp-auto {
  --st-line: #2f8fc6; --st-line-soft: #8ec9ea; --st-empty: #a9d2ea;
  --st-fill-a: #e2f3fc; --st-fill-b: #93d2f2; --st-fill-c: #5fb6e6;
  --st-mint-a: #dcf5ec; --st-mint-b: #9fdcc8;
  --st-lav-line: #7b6fcf; --st-lav-soft: #bdb4ec; --st-lav-a: #eeebfc; --st-lav-b: #c4bbf1; --st-lav-c: #9d90e3;
  --st-halo: #ffffff; --st-gloss: #ffffff; --st-sparkle: #ffffff;
  --pv-bg: #ffffff; --pv-surface: #f3f9fd; --pv-text: #2b2f33; --pv-muted: #66717c; --pv-border: #cbe4f3;
}
.stamp-dark {
  --st-line: #8fd3f7; --st-line-soft: #4f87a8; --st-empty: #3f6178;
  --st-fill-a: #1d3a4d; --st-fill-b: #3f8fbd; --st-fill-c: #6cc2f0;
  --st-mint-a: #2b5f55; --st-mint-b: #5fb59b;
  --st-lav-line: #c3baf5; --st-lav-soft: #6d63a8; --st-lav-a: #2c2848; --st-lav-b: #7468b8; --st-lav-c: #a99df0;
  --st-halo: #2a3a48; --st-gloss: #e9f6fd; --st-sparkle: #f4fbff;
  --pv-bg: #11171c; --pv-surface: #18212a; --pv-text: #e9eef2; --pv-muted: #9ba8b3; --pv-border: #2a3c4a;
}
@media (prefers-color-scheme: dark) {
  .stamp-auto {
    --st-line: #8fd3f7; --st-line-soft: #4f87a8; --st-empty: #3f6178;
    --st-fill-a: #1d3a4d; --st-fill-b: #3f8fbd; --st-fill-c: #6cc2f0;
    --st-mint-a: #2b5f55; --st-mint-b: #5fb59b;
    --st-lav-line: #c3baf5; --st-lav-soft: #6d63a8; --st-lav-a: #2c2848; --st-lav-b: #7468b8; --st-lav-c: #a99df0;
    --st-halo: #2a3a48; --st-gloss: #e9f6fd; --st-sparkle: #f4fbff;
    --pv-bg: #11171c; --pv-surface: #18212a; --pv-text: #e9eef2; --pv-muted: #9ba8b3; --pv-border: #2a3c4a;
  }
}
.stamp-panel { background: var(--pv-bg); color: var(--pv-text); border: 1px solid var(--pv-border); }
.stamp-pop { animation: stamp-pop 260ms cubic-bezier(.3,1.6,.5,1); }
.stamp-twinkle { animation: stamp-twinkle 520ms ease-out; }
@keyframes stamp-pop { 0% { transform: scale(.82); } 60% { transform: scale(1.08); } 100% { transform: scale(1); } }
@keyframes stamp-twinkle { 0% { transform: scale(0) rotate(-30deg); opacity: 0; } 55% { transform: scale(1.35) rotate(8deg); opacity: 1; } 100% { transform: scale(1) rotate(0); } }
@media (prefers-reduced-motion: reduce) { .stamp-pop, .stamp-twinkle { animation: none; } }
`;
