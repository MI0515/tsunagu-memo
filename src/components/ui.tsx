"use client";

import Link from "next/link";
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { tapFeedback } from "@/lib/feedback";

// 画面全体の枠（スマホの幅に合わせ、ノッチ部分を避ける）
export function Page({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      {children}
    </main>
  );
}

export function AppTitle({ sub }: { sub?: string }) {
  return (
    <header className="pt-2 text-center">
      <p className="text-3xl font-bold tracking-wide text-primary">つなぐメモ</p>
      {sub && <p className="mt-1 text-muted">{sub}</p>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-border bg-surface p-5 ${className}`}>{children}</section>
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
      className={`min-h-14 w-full rounded-2xl px-5 py-3 text-lg font-bold transition-[transform,background-color] duration-150 active:scale-[0.97] disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {loading ? "少し待ってください…" : children}
    </button>
  );
}

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "soft" }) {
  return (
    <Link
      href={href}
      onClick={tapFeedback}
      className={`flex min-h-14 w-full items-center justify-center rounded-2xl px-5 py-3 text-lg font-bold transition-transform active:scale-[0.97] ${VARIANTS[variant]}`}
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
        className="min-h-14 rounded-2xl border-2 border-border bg-bg px-4 text-lg outline-none focus:border-primary"
      />
      <span className="flex justify-between text-sm text-muted">
        <span>{hint}</span>
        {maxLength && <span>{length}/{maxLength}</span>}
      </span>
    </label>
  );
}

// 困った時のお知らせ（責める色の赤は使わない）
export function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl bg-alert-bg px-4 py-3 text-alert-text">
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
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-bg px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="min-h-11 rounded-full px-4 text-muted active:bg-surface" aria-label="閉じる">
            閉じる
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Loading() {
  return <p className="py-16 text-center text-muted">読み込んでいます…</p>;
}
