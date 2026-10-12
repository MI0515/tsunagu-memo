"use client";

import Link from "next/link";
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { tapFeedback } from "@/lib/feedback";

// 画面全体の枠（スマホの幅に合わせ、ノッチ部分を避ける）
// withTabs の時は、下のタブに隠れないように下側を広く空ける
export function Page({ children, withTabs = false }: { children: ReactNode; withTabs?: boolean }) {
  return (
    <main
      className={`mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-[max(1rem,env(safe-area-inset-top))] ${
        withTabs
          ? "pb-[calc(var(--tabbar-height)+env(safe-area-inset-bottom)+1.5rem)]"
          : "pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      }`}
    >
      {children}
    </main>
  );
}

export function AppTitle({ sub }: { sub?: string }) {
  return (
    <header className="pt-4 text-center">
      <p className="text-2xl font-bold tracking-wide text-primary">つなぐメモ</p>
      {sub && <p className="mt-1 text-sm text-muted"><Phrases text={sub} /></p>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-border bg-surface p-4 ${className}`}>{children}</section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "soft" | "ghost";
  loading?: boolean;
};

const VARIANTS = {
  primary: "bg-primary text-on-primary active:bg-primary-press",
  soft: "bg-primary-soft text-text active:bg-surface-strong",
  ghost: "bg-transparent text-primary underline-offset-4 active:underline",
};

// 大きく押しやすいボタン。押すと軽く縮み、Androidでは小さく振動する
export function Button({ variant = "primary", loading, children, className = "", onClick, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      onClick={(e) => {
        tapFeedback();
        onClick?.(e);
      }}
      aria-busy={loading || undefined}
      className={`min-h-12 w-full rounded-2xl px-4 py-2.5 text-base font-bold leading-snug transition-[transform,background-color] duration-150 active:scale-[0.97] disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {children}
      {loading && "…"}
    </button>
  );
}

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "soft" }) {
  return (
    <Link
      href={href}
      onClick={tapFeedback}
      className={`flex min-h-12 w-full items-center justify-center rounded-2xl px-4 py-2.5 text-base font-bold leading-snug transition-transform active:scale-[0.97] ${VARIANTS[variant]}`}
    >
      {children}
    </Link>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string };

export function Field({ label, hint, id, maxLength, value, ...rest }: FieldProps) {
  const length = typeof value === "string" ? value.length : 0;
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="font-bold">{label}</span>
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        {...rest}
        className="min-h-12 w-full min-w-0 rounded-2xl border-2 border-border bg-bg px-3.5 text-base outline-none focus:border-primary"
      />
      <span className="flex justify-between gap-3 text-sm text-muted">
        <span className="min-w-0">{hint}</span>
        {maxLength && <span className="shrink-0 tabular-nums">{length}/{maxLength}</span>}
      </span>
    </label>
  );
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string };

// 複数行の入力欄（振り返りなど）
export function TextArea({ label, hint, id, maxLength, value, rows = 6, ...rest }: TextAreaProps) {
  const length = typeof value === "string" ? value.length : 0;
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="font-bold">{label}</span>
      <textarea
        id={id}
        value={value}
        maxLength={maxLength}
        rows={rows}
        {...rest}
        className="w-full min-w-0 rounded-2xl border-2 border-border bg-bg px-3.5 py-3 text-base leading-relaxed outline-none focus:border-primary"
      />
      <span className="flex justify-between gap-3 text-sm text-muted">
        <span className="min-w-0">{hint}</span>
        {maxLength && <span className="shrink-0 tabular-nums">{length}/{maxLength}</span>}
      </span>
    </label>
  );
}

// 困った時のお知らせ（責める色の赤は使わない）
export function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl bg-alert-bg px-4 py-3 text-sm leading-relaxed text-alert-text">
      {children}
    </p>
  );
}

// 下から出てくるパネル。外側をタップすると閉じる
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-bg px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="min-w-0 text-lg font-bold leading-snug">{title}</h2>
          <button onClick={onClose} className="min-h-11 shrink-0 rounded-full px-3 text-sm text-muted active:bg-surface" aria-label="閉じる">
            閉じる
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// 削除などの前に出す確認。「削除」「キャンセル」の2つだけ
export function ConfirmSheet({
  title,
  message,
  confirmLabel = "削除",
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet title={title} onClose={onCancel}>
      <div className="flex flex-col gap-4">
        <div className="leading-relaxed">{message}</div>
        {error && <Alert>{error}</Alert>}
        <Button onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        <Button variant="soft" onClick={onCancel}>キャンセル</Button>
      </div>
    </Sheet>
  );
}

export function Loading() {
  return <p className="py-12 text-center text-sm text-muted">読み込んでいます…</p>;
}

// 日本語の文を、句読点（、。！？）までのかたまりで折り返す。
// 「まだ空／です」のような、言葉の途中での改行を防ぐ
export function Phrases({ text }: { text: string }) {
  const parts = text.split(/([、。！？])/).reduce<string[]>((acc, part, i) => {
    if (i % 2 === 1) acc[acc.length - 1] += part;
    else if (part) acc.push(part);
    return acc;
  }, []);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className="phrase">{p}</span>
      ))}
    </>
  );
}

// 中身がまだない時の案内（点線の枠）
export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <section className="rounded-3xl border-2 border-dashed border-border px-4 py-6 text-center">
      <p className="font-bold"><Phrases text={title} /></p>
      {body && <p className="mt-1 text-sm text-muted"><Phrases text={body} /></p>}
    </section>
  );
}

// 区切りの見出し
export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div>
      <h2 className="text-[1.0625rem] font-bold leading-snug">{children}</h2>
      {sub && <p className="text-sm text-muted"><Phrases text={sub} /></p>}
    </div>
  );
}

// 画面の見出し（20px）と、その下の補足
export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <h1 className="text-xl font-bold leading-snug">{children}</h1>
      {sub && <p className="text-sm text-muted">{sub}</p>}
    </div>
  );
}
