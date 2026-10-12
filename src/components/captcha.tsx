"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";

// ロボット対策（Cloudflare Turnstile）。
// 匿名ログインする前（ルーム作成・招待参加・引き継ぎ）にだけ使う。すでにログインしている人には出さない。
// サイトキー（NEXT_PUBLIC_TURNSTILE_SITE_KEY）が未設定の時は、確認なしで進める。

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

// Cloudflare の部品は1回だけ読み込む
let loading: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    script.onerror = () => {
      loading = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function useCaptcha() {
  const [needed, setNeeded] = useState<boolean | null>(SITE_KEY ? null : false);
  const [token, setToken] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  // 置き場所は、ページの表示に合わせて後から現れることがあるので、現れた時に準備する
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);

  // すでにログインしていれば、確認はいらない
  useEffect(() => {
    if (!SITE_KEY) return;
    getSupabase().auth.getSession().then(({ data }) => setNeeded(!data.session));
  }, []);

  useEffect(() => {
    if (!needed || !box) return;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return;
        widgetId.current = turnstile.render(box, {
          sitekey: SITE_KEY,
          language: "ja",
          theme: "auto",
          size: "flexible",
          // 確認が必要な時だけ、枠を表示する
          appearance: "interaction-only",
          callback: (t: string) => {
            setToken(t);
            setFailed(false);
          },
          "expired-callback": () => setToken(undefined),
          "error-callback": () => {
            setToken(undefined);
            setFailed(true);
          },
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [needed, box]);

  // 1つの確認結果は1回しか使えないので、失敗したらやり直す
  const reset = useCallback(() => {
    setToken(undefined);
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }, []);

  const widget = needed ? (
    <div className="flex flex-col gap-1">
      <div ref={setBox} />
      {!token && (
        <p className="text-sm text-muted">
          {failed
            ? "ロボットでないことの確認がうまくいきませんでした。通信の状態を確かめて、ページを読み込み直してください。"
            : "ロボットでないことを確認しています…"}
        </p>
      )}
    </div>
  ) : null;

  return {
    token,
    ready: needed === false || (needed === true && !!token),
    widget,
    reset,
  };
}
