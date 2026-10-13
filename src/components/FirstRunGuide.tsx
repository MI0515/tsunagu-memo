"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Phrases } from "@/components/ui";
import { tapFeedback } from "@/lib/feedback";

// 初回ガイド（5枚のスライド）。いつでもスキップでき、1度見たら（スキップしたら）この端末では自動で出さない。
// 設定の「使い方を見る」から、いつでも見直せる。

const SEEN_KEY = "tsunagu:guideSeen";

export function hasSeenGuide(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // 保存できない環境では、今回だけ閉じる
  }
}

// 線で描いたアイコン（色は文字色に合わせる）
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
      {children}
    </svg>
  );
}

const SLIDES: { kicker: string; icon: ReactNode; title: string; body: string; sub: string }[] = [
  {
    kicker: "はじめに",
    icon: (
      <Icon>
        <path d="M11 3.5Q12.4 9.6 18.5 11Q12.4 12.4 11 18.5Q9.6 12.4 3.5 11Q9.6 9.6 11 3.5Z" />
        <path d="M18.5 3v3M17 4.5h3" />
      </Icon>
    ),
    title: "大切にしたいことを、忘れないために",
    body: "つなぐメモは、大切にしたい価値観や具体的な行動を、何度でも思い出すための場所です。",
    sub: "できた・できなかったを競うのではなく、お互いの気持ちを大切にするために。",
  },
  {
    kicker: "ルーム",
    icon: (
      <Icon>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
        <circle cx="16.5" cy="9" r="2.5" />
        <path d="M15.5 14.2a4.5 4.5 0 0 1 5 4.8" />
      </Icon>
    ),
    title: "ルームを作って、招待しよう",
    body: "ルームを作成したら、招待リンクで大切な人を招待できます。",
    sub: "パートナーや家族、友人と、一緒にメモを共有できます。",
  },
  {
    kicker: "メモ",
    icon: (
      <Icon>
        <rect x="5" y="4" width="13" height="16" rx="2" />
        <path d="M9 3v2M14 3v2M8.5 10h6M8.5 13.5h4" />
        <path d="M17.5 14.5 20 17l-3.5 3.5H14V18z" />
      </Icon>
    ),
    title: "忘れたくないことを、メモに残そう",
    body: "大切にしたい価値観や、困ったときに役立つ具体策を、メモに残せます。",
    sub: "最初から用意されたメモも、自由に編集できます。",
  },
  {
    kicker: "今日",
    icon: (
      <Icon>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16" />
        <path d="m9 15 2 2 4-4" />
      </Icon>
    ),
    title: "今日の確認項目を選ぼう",
    body: "メモから今日意識したい項目を選んで、朝に確認できます。",
    sub: "前日のうちに、明日の確認項目を準備しておくこともできます。",
  },
  {
    kicker: "ふりかえり",
    icon: (
      <Icon>
        <path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5Z" />
        <path d="M12 6.5V19.5" />
      </Icon>
    ),
    title: "確認して、振り返ろう",
    body: "朝は大切にしたいことを確認し、夜は一日を振り返りましょう。",
    sub: "スタンプは達成の判定ではありません。うまくいかなかった日も、気づいたことを次につなげるために。",
  },
];

// force：設定の「使い方を見る」から開く時は、見たことがあっても表示する
export function FirstRunGuide({ force = false, onClose }: { force?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    setOpen(force || !hasSeenGuide());
  }, [force]);

  function close() {
    markSeen();
    setOpen(false);
    onClose?.();
  }

  function go(next: number) {
    if (next < 0 || next >= SLIDES.length) return;
    tapFeedback();
    setIndex(next);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!open) return null;
  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="はじめての使い方"
      className="fixed inset-0 z-50 flex justify-center bg-bg"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? index + 1 : index - 1);
      }}
    >
      <div className="flex h-full w-full max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex min-h-11 items-center justify-between gap-3 text-sm text-muted">
          <span className="min-w-0 truncate">はじめての使い方</span>
          <span className="flex shrink-0 items-center gap-3">
            <span className="tabular-nums">{index + 1} / {SLIDES.length}</span>
            <button onClick={close} className="min-h-11 rounded-full px-3 font-bold text-primary active:bg-surface">
              スキップ
            </button>
          </span>
        </div>

        <section key={index} aria-live="polite" className="animate-pop flex flex-1 flex-col items-center justify-center gap-3 px-2 text-center">
          <p className="text-sm text-muted">
            <span className="font-bold tabular-nums">{String(index + 1).padStart(2, "0")}</span> / {slide.kicker}
          </p>
          {slide.icon}
          <h2 className="text-xl font-bold leading-snug"><Phrases text={slide.title} /></h2>
          <p className="leading-relaxed">{slide.body}</p>
          <p className="text-sm leading-relaxed text-muted">{slide.sub}</p>
        </section>

        <div className="mb-4 flex justify-center gap-2" aria-hidden>
          {SLIDES.map((_, i) => (
            <span key={i} className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-primary" : "w-2 bg-border"}`} />
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => go(index - 1)}
            disabled={index === 0}
            className="min-h-12 shrink-0 rounded-2xl border-2 border-border px-5 font-bold text-muted active:scale-[0.97] disabled:opacity-40"
          >
            戻る
          </button>
          <button
            onClick={() => (last ? close() : go(index + 1))}
            className="min-h-12 flex-1 rounded-2xl bg-primary px-4 font-bold text-on-primary active:scale-[0.97]"
          >
            {last ? "使い始める" : "次へ →"}
          </button>
        </div>
      </div>
    </div>
  );
}
