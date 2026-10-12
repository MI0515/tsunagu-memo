"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tapFeedback } from "@/lib/feedback";

const TABS = [
  { href: "/", label: "今日", icon: "☀️", match: (p: string) => p === "/" },
  { href: "/memos", label: "メモ", icon: "📝", match: (p: string) => p.startsWith("/memos") },
  { href: "/review", label: "ふりかえり", icon: "📖", match: (p: string) => p.startsWith("/review") || p.startsWith("/day") },
  { href: "/settings", label: "設定", icon: "⚙️", match: (p: string) => p.startsWith("/settings") },
];

// 画面下のタブ。片手で押しやすい高さにする
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="画面の切り替え"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid h-[var(--tabbar-height)] max-w-md grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                onClick={tapFeedback}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 whitespace-nowrap text-xs transition-transform active:scale-95 ${
                  active ? "font-bold text-primary" : "text-muted"
                }`}
              >
                <span aria-hidden className={`text-[1.375rem] leading-none ${active ? "" : "opacity-60 grayscale"}`}>
                  {tab.icon}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
