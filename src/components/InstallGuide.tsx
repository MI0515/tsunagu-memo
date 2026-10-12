"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui";
import { tapFeedback } from "@/lib/feedback";
import { useDevice } from "@/lib/device";

// iPhone の「共有」ボタンの形（四角から上向きの矢印）
function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-label="共有ボタン" className="inline-block align-[-3px]">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ホーム画面に追加する手順（iPhone の Safari 向け）
export function InstallSteps() {
  const steps = [
    <>画面の下（または上）にある、共有ボタン <ShareIcon /> を押す</>,
    <>メニューを下へ動かして「ホーム画面に追加」を選ぶ</>,
    <>右上の「追加」を押す</>,
    <>ホーム画面に出た「つなぐメモ」から開き、「引き継ぎコード」を入力する</>,
  ];
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-2 rounded-2xl bg-surface px-3 py-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">
            {i + 1}
          </span>
          <span className="min-w-0 leading-relaxed">{step}</span>
        </li>
      ))}
    </ol>
  );
}

const DISMISS_KEY = "tsunagu:installHintDismissed";

// iPhone の Safari で開いている時だけ出す、小さな案内。閉じたら次からは出さない
export function InstallHint() {
  const device = useDevice();
  const [dismissed, setDismissed] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!device?.ios || device.standalone || dismissed) return null;

  function dismiss() {
    tapFeedback();
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // 保存できない環境では、今回だけ閉じる
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 rounded-2xl bg-primary-soft px-3 py-2">
        <p className="min-w-0 flex-1 text-sm leading-snug">ホーム画面に追加すると、アプリのように開けます。</p>
        <button
          onClick={() => {
            tapFeedback();
            setOpen(true);
          }}
          className="min-h-11 shrink-0 whitespace-nowrap rounded-full bg-bg px-3 text-sm font-bold text-primary"
        >
          手順を見る
        </button>
        <button onClick={dismiss} aria-label="案内を閉じる" className="flex min-h-11 w-9 shrink-0 items-center justify-center text-muted">
          ×
        </button>
      </div>
      {open && (
        <Sheet title="ホーム画面に追加" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3">
            <InstallSteps />
            <p className="text-sm text-muted">
              ホーム画面のアプリは、Safariとは別に記録を持っています。最初に開いた時だけ、Safariの「設定」で発行した引き継ぎコードを入力すると、同じあなたとして続きから使えます。
            </p>
          </div>
        </Sheet>
      )}
    </>
  );
}
