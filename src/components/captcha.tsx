"use client";

// ロボット対策（Cloudflare Turnstile）の差し込み口。
// サイトキー（NEXT_PUBLIC_TURNSTILE_SITE_KEY）が未設定のあいだは、確認なしで進める。
// Cloudflare の準備ができたら、ここに確認用の部品を組み込む。
export function useCaptcha() {
  return {
    token: undefined as string | undefined,
    ready: true,
    widget: null,
    reset: () => {},
  };
}
