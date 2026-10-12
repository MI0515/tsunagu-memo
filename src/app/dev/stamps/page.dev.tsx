"use client";

import { useState, type ReactNode } from "react";
import { tapFeedback } from "@/lib/feedback";
import { STAMP_STYLES, StampButton, StampIcon, type Motif, type Slot, type StampState, type Texture } from "./Stamp";

// スタンプのデザイン試作（開発中だけ表示。公開版には含まれない）

const MOTIFS: { key: Motif; name: string; note: string }[] = [
  { key: "sprout", name: "A：芽＋小さなきらめき", note: "大切なことを育てるイメージ。葉は2枚だけに単純化" },
  { key: "round", name: "B：丸いシール＋小さなきらめき", note: "ぷっくりした丸。並べたときに一番落ち着いて見える" },
  { key: "glint", name: "C：きらめきの印", note: "丸みのある4つ角の光と、小さな反射。⭐（5つ角）とは別の形" },
];
const TEXTURES: { key: Texture; name: string }[] = [
  { key: "line", name: "線画寄り" },
  { key: "sticker", name: "シール寄り" },
];
const STATES: { key: StampState; name: string; count: number }[] = [
  { key: "none", name: "0人", count: 0 },
  { key: "mine", name: "自分が押した", count: 2 },
  { key: "others", name: "ほかの人だけ", count: 1 },
];

const ITEMS = [
  "予定が変わる日は、先に連絡の見通しを伝える",
  "相手を思いやることと、自分の気持ちを伝えることを両立する",
  "不安なときほど、推測だけで結論を出さない",
  "くわしい説明より、まず短い連絡を優先する",
  "ありがとうを、言葉にして伝える",
  "違和感は、態度ではなく言葉で伝える",
  "大事なことは、事前にすり合わせる",
  "反省は、次に使える具体策にしておく",
  "責め合わずに、次の一歩を一緒に考える",
  "信頼は、その後の行動の積み重ねで育てる",
];

const ME = { name: "あなた", emoji: "🐻" };
const OTHERS = [
  { name: "メンバー2", emoji: "🐰" },
  { name: "メンバー3", emoji: "🐱" },
];

type Press = { who: string; emoji: string; at: string };
type Board = Record<string, Press[]>; // key = `${index}-${slot}`

// はじめの状態：いろいろな組み合わせが見えるようにばらつかせる
function initialBoard(): Board {
  const board: Board = {};
  const pattern: [number, Slot, ("me" | 0 | 1)[]][] = [
    [0, "morning", ["me", 0]], [0, "night", [0]],
    [1, "morning", ["me"]], [1, "night", []],
    [2, "morning", [0]], [2, "night", [0, 1]],
    [3, "morning", ["me", 0, 1]], [3, "night", ["me"]],
    [4, "morning", []], [4, "night", [1]],
    [5, "morning", [0]], [6, "morning", ["me"]], [6, "night", ["me", 0]],
    [8, "night", [0]],
  ];
  for (const [i, slot, who] of pattern) {
    board[`${i}-${slot}`] = who.map((w, n) => {
      const person = w === "me" ? ME : OTHERS[w];
      return { who: person.name, emoji: person.emoji, at: `${slot === "morning" ? 7 : 22}:${String(10 + n * 7).padStart(2, "0")}` };
    });
  }
  return board;
}

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { key: T; name: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="w-full text-sm text-muted">{label}</span>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => {
            tapFeedback();
            onChange(o.key);
          }}
          aria-pressed={value === o.key}
          className={`min-h-11 rounded-full border-2 px-4 text-sm font-bold transition-colors active:scale-95 ${
            value === o.key ? "border-primary bg-primary text-on-primary" : "border-border text-muted"
          }`}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

function ThemePanel({ theme, children, className = "" }: { theme: "light" | "dark"; children: ReactNode; className?: string }) {
  return (
    <div className={`stamp-${theme} stamp-panel rounded-3xl p-4 ${className}`}>
      <p className="mb-2 text-xs" style={{ color: "var(--pv-muted)" }}>{theme === "light" ? "ライト" : "ダーク"}</p>
      {children}
    </div>
  );
}

// 3つの状態 × 2つの質感を、ライト・ダークで並べる
function StateMatrix({ motif, splitTint }: { motif: Motif; splitTint: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(["light", "dark"] as const).map((theme) => (
        <ThemePanel key={theme} theme={theme}>
          <table className="w-full text-center text-xs">
            <thead>
              <tr style={{ color: "var(--pv-muted)" }}>
                <th className="pb-1 text-left font-normal">質感</th>
                {STATES.map((s) => <th key={s.key} className="pb-1 font-normal">{s.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {TEXTURES.map((t) => (
                <tr key={t.key}>
                  <th className="text-left font-normal" style={{ color: "var(--pv-muted)" }}>{t.name}</th>
                  {STATES.map((s) => (
                    <td key={s.key} className="py-1">
                      <div className="flex flex-col items-center">
                        <StampIcon motif={motif} texture={t.key} state={s.key} splitTint={splitTint} size={40} />
                        <span className="h-4 text-xs tabular-nums" style={{ color: s.key === "mine" ? "var(--st-line)" : "var(--pv-muted)", fontWeight: s.key === "mine" ? 700 : 400 }}>
                          {s.count || ""}
                        </span>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ThemePanel>
      ))}
    </div>
  );
}

// 実際の確認リストのように10項目並べ、押して試せる
function Checklist({ motif, texture, splitTint, theme }: { motif: Motif; texture: Texture; splitTint: boolean; theme: "light" | "dark" }) {
  const [board, setBoard] = useState<Board>(initialBoard);
  const [presses, setPresses] = useState<Record<string, number>>({});
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function toggle(key: string) {
    tapFeedback();
    setBoard((b) => {
      const list = b[key] ?? [];
      const mine = list.some((p) => p.who === ME.name);
      const now = new Date();
      return {
        ...b,
        [key]: mine
          ? list.filter((p) => p.who !== ME.name)
          : [...list, { who: ME.name, emoji: ME.emoji, at: `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}` }],
      };
    });
    setPresses((p) => ({ ...p, [key]: (p[key] ?? 0) + 1 }));
  }

  return (
    <div className={`stamp-${theme} stamp-panel rounded-3xl p-3`}>
      <div className="mb-1 flex items-end justify-end gap-1 pr-1 text-center text-xs" style={{ color: "var(--pv-muted)" }}>
        <span className="w-14">☀️ 朝</span>
        <span className="w-14">🌙 夜</span>
      </div>
      <ul className="flex flex-col">
        {ITEMS.map((text, i) => (
          <li key={text} className="border-t py-1" style={{ borderColor: "var(--pv-border)" }}>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="min-h-14 flex-1 py-2 pl-1 text-left text-[0.95rem] leading-snug"
              >
                {text}
              </button>
              {(["morning", "night"] as const).map((slot) => {
                const key = `${i}-${slot}`;
                const list = board[key] ?? [];
                return (
                  <StampButton
                    key={slot}
                    label={`${i + 1}番目の${slot === "morning" ? "朝" : "夜"}の確認`}
                    motif={motif}
                    texture={texture}
                    slot={slot}
                    splitTint={splitTint}
                    size={34}
                    count={list.length}
                    mine={list.some((p) => p.who === ME.name)}
                    animateKey={presses[key]}
                    onPress={() => toggle(key)}
                  />
                );
              })}
            </div>
            {openIndex === i && (
              <div className="mb-2 rounded-2xl p-3 text-sm" style={{ background: "var(--pv-surface)" }}>
                {(["morning", "night"] as const).map((slot) => {
                  const list = board[`${i}-${slot}`] ?? [];
                  return (
                    <p key={slot}>
                      {slot === "morning" ? "☀️ 朝：" : "🌙 夜："}
                      {list.length === 0 ? <span style={{ color: "var(--pv-muted)" }}>まだだれも押していません</span>
                        : list.map((p) => `${p.emoji}${p.who} ${p.at}`).join("、")}
                    </p>
                  );
                })}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function StampPreviewPage() {
  const [motif, setMotif] = useState<Motif>("round");
  const [texture, setTexture] = useState<Texture>("sticker");
  const [split, setSplit] = useState<"same" | "split">("same");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const splitTint = split === "split";

  return (
    <main className="stamp-auto mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-8">
      <style>{STAMP_STYLES}</style>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">スタンプ試作（開発用）</h1>
        <p className="text-sm text-muted">
          このページは開発中（npm run dev）だけ表示され、本番・デモの公開版には含まれません。
          既存の画面は変更していません。
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">1. 3つのモチーフ × 3つの状態</h2>
        <p className="text-sm text-muted">
          0人は点線だけ／ほかの人だけは実線と淡い塗り／自分が押した時は、しっかりした塗りと小さなきらめき。
          色だけでなく、線の種類ときらめきの有無でも見分けられます。
        </p>
        <Segmented label="朝と夜の色" value={split} onChange={setSplit}
          options={[{ key: "same", name: "朝夜とも空色" }, { key: "split", name: "夜はラベンダー" }]} />
        {MOTIFS.map((m) => (
          <div key={m.key} className="flex flex-col gap-2">
            <h3 className="font-bold">{m.name}</h3>
            <p className="text-sm text-muted">{m.note}</p>
            <StateMatrix motif={m.key} splitTint={splitTint} />
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">2. 朝と夜を並べると</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["light", "dark"] as const).map((t) => (
            <ThemePanel key={t} theme={t}>
              <table className="w-full text-center text-xs">
                <thead>
                  <tr style={{ color: "var(--pv-muted)" }}>
                    <th />
                    <th className="font-normal">空色のみ ☀️ / 🌙</th>
                    <th className="font-normal">夜はラベンダー ☀️ / 🌙</th>
                  </tr>
                </thead>
                <tbody>
                  {MOTIFS.map((m) => (
                    <tr key={m.key}>
                      <th className="text-left font-normal" style={{ color: "var(--pv-muted)" }}>{m.name.slice(0, 1)}</th>
                      {[false, true].map((sp) => (
                        <td key={String(sp)} className="py-1">
                          <span className="inline-flex gap-2">
                            <StampIcon motif={m.key} texture="sticker" state="mine" slot="morning" splitTint={sp} size={34} />
                            <StampIcon motif={m.key} texture="sticker" state="mine" slot="night" splitTint={sp} size={34} />
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ThemePanel>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">3. 小さい表示サイズ</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["light", "dark"] as const).map((t) => (
            <ThemePanel key={t} theme={t}>
              {MOTIFS.map((m) => (
                <div key={m.key} className="flex flex-wrap items-center gap-3 py-1">
                  <span className="w-5 text-xs" style={{ color: "var(--pv-muted)" }}>{m.name.slice(0, 1)}</span>
                  {[18, 22, 28].map((size) => (
                    <span key={size} className="inline-flex items-center gap-1">
                      {STATES.map((s) => (
                        <StampIcon key={s.key} motif={m.key} texture={texture} state={s.key} splitTint={splitTint} size={size} />
                      ))}
                      <span className="ml-1 text-[10px]" style={{ color: "var(--pv-muted)" }}>{size}px</span>
                    </span>
                  ))}
                </div>
              ))}
              <p className="mt-1 text-[10px]" style={{ color: "var(--pv-muted)" }}>各サイズで左から 0人／自分／ほかの人だけ（質感は下の切り替えに連動）</p>
            </ThemePanel>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">4. 確認リストに10項目並べて、押して試す</h2>
        <p className="text-sm text-muted">
          スタンプを押すと「自分が押した」になり、もう一度押すと取り消せます。項目の文をタップすると、だれがいつ押したかが出ます。
          はじめは、ほかのメンバーが押した状態などを混ぜてあります。
        </p>
        <div className="flex flex-col gap-3 rounded-3xl border border-border p-4">
          <Segmented label="モチーフ" value={motif} onChange={setMotif}
            options={MOTIFS.map((m) => ({ key: m.key, name: m.name.split("：")[0] + "：" + m.name.split("：")[1].split("＋")[0] }))} />
          <Segmented label="質感" value={texture} onChange={setTexture} options={TEXTURES} />
          <Segmented label="朝と夜の色" value={split} onChange={setSplit}
            options={[{ key: "same", name: "朝夜とも空色" }, { key: "split", name: "夜はラベンダー" }]} />
          <Segmented label="表示" value={theme} onChange={setTheme}
            options={[{ key: "light", name: "ライト" }, { key: "dark", name: "ダーク" }]} />
        </div>
        <Checklist motif={motif} texture={texture} splitTint={splitTint} theme={theme} />
      </section>
    </main>
  );
}
