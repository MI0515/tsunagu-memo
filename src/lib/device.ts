"use client";

import { useEffect, useState } from "react";

// ホーム画面に追加したアプリとして開いているか
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

// iPhone・iPad（iPadOS はパソコンのように名乗るので、タッチ対応かどうかでも見分ける）
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

// 画面を組み立てたあとに判定する（サーバーで作る最初の画面とずれないようにするため）
export function useDevice() {
  const [device, setDevice] = useState<{ standalone: boolean; ios: boolean } | null>(null);
  useEffect(() => {
    setDevice({ standalone: isStandalone(), ios: isIOS() });
  }, []);
  return device;
}
