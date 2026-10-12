"use client";

import { useEffect, useState } from "react";
import { jstToday } from "./date";

// 日本時間の0時を過ぎたら「今日」を切り替える（アプリに戻ってきた時も確かめる）
export function useToday() {
  const [today, setToday] = useState(jstToday);
  useEffect(() => {
    const check = () => setToday(jstToday());
    const timer = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return today;
}
