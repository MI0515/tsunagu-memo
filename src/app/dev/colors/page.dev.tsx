"use client";

// メンバーの色の比較（開発用。公開版には含まれない）
// 色覚のシミュレーションは Machado ら（2009）の重度の行列を使う。

type Palette = { name: string; note: string; light: string[]; dark: string[]; score: string };

const PALETTES: Palette[] = [
  {
    name: "いまの6色",
    note: "P型でオレンジ（2）と山吹（5）がほぼ同じ色に。灰色（6）は「退出したメンバー」の灰色と重なる",
    light: ["#1f6fb2", "#b4530f", "#0f7a5c", "#a3437c", "#876200", "#5b6470"],
    dark: ["#7cc0f5", "#f3a36b", "#5fd0ad", "#ea9ccb", "#e8c95a", "#b8c2cc"],
    score: "見分けにくい2色の差：0.5（P型 2と5）",
  },
  {
    name: "案1（おすすめ）",
    note: "はっきりしたオレンジ、黄緑、青緑、青、紫、ローズ。灰色と赤はなし",
    light: ["#3d79a0", "#c34e10", "#138361", "#bb4b7d", "#924de6", "#46810a"],
    dark: ["#85b2d1", "#f29563", "#1cc391", "#d99bb7", "#c29cf1", "#69c210"],
    score: "見分けにくい2色の差：5.5",
  },
  {
    name: "案2",
    note: "案1の紫を青紫に、黄緑をオリーブに。全体に少し落ち着いた色",
    light: ["#2d7b9c", "#c34e10", "#13844b", "#bb4b83", "#5a61f2", "#637c1a"],
    dark: ["#6db6d5", "#f29563", "#1cc571", "#d99aba", "#a1a6f7", "#95b927"],
    score: "見分けにくい2色の差：5.5",
  },
];

const EMOJIS = ["🐻", "🐰", "🐱", "🐶", "🐼", "🦊"];
const NAMES = ["メンバー1", "メンバー2", "メンバー3", "メンバー4", "メンバー5", "メンバー6"];

const MATRICES: Record<string, number[][]> = {
  P型: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  D型: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  T型: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

function simulate(hex: string, m: number[][]) {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const gam = (v: number) => {
    const c = Math.min(1, Math.max(0, v));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  };
  const c = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return "#" + m.map((r) => Math.round(gam(r[0] * c[0] + r[1] * c[1] + r[2] * c[2]) * 255).toString(16).padStart(2, "0")).join("");
}

function Panel({ palette, theme }: { palette: Palette; theme: "light" | "dark" }) {
  const colors = palette[theme];
  const bg = theme === "light" ? "#ffffff" : "#11171c";
  const surface = theme === "light" ? "#f3f9fd" : "#18212a";
  const text = theme === "light" ? "#2b2f33" : "#e9eef2";
  const muted = theme === "light" ? "#66717c" : "#9ba8b3";
  return (
    <div className="rounded-3xl p-4" style={{ background: bg, color: text, border: `1px solid ${theme === "light" ? "#cbe4f3" : "#2a3c4a"}` }}>
      <p className="mb-2 text-xs" style={{ color: muted }}>{theme === "light" ? "ライト" : "ダーク"}</p>

      {/* 表示名（実際の画面と同じ太字） */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {colors.map((c, i) => (
          <p key={c} className="font-bold" style={{ color: c }}>
            {EMOJIS[i]} {NAMES[i]}
          </p>
        ))}
      </div>

      {/* 振り返りカード（2pxの線＋名前） */}
      <div className="mt-3 flex flex-col gap-2">
        {colors.slice(0, 3).map((c, i) => (
          <div key={c} className="rounded-2xl px-3 py-2 text-sm" style={{ background: surface, borderLeft: `2px solid ${c}` }}>
            <span className="font-bold" style={{ color: c }}>{EMOJIS[i]} {NAMES[i]}</span>
            <p>今日は、先に短く連絡できた。</p>
          </div>
        ))}
      </div>

      {/* 色覚の見え方（シミュレーション） */}
      <div className="mt-3 flex flex-col gap-1 text-xs" style={{ color: muted }}>
        {(["通常", ...Object.keys(MATRICES)] as string[]).map((kind) => (
          <div key={kind} className="flex items-center gap-2">
            <span className="w-8">{kind}</span>
            {colors.map((c, i) => {
              const shown = kind === "通常" ? c : simulate(c, MATRICES[kind]);
              return (
                <span key={c} className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: shown }}>
                  {i + 1}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ColorPreviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">メンバーの色の比較（開発用）</h1>
        <p className="text-sm text-muted">
          このページは開発中だけ表示され、公開版には含まれません。どの案も、表示名はライト・ダークの両方で文字として読める濃さ（4.5以上）です。
          色覚の見え方は計算による再現で、実際の見え方には個人差があります。色だけに頼らず、絵文字と名前も必ず並べます。
        </p>
      </header>
      {PALETTES.map((p) => (
        <section key={p.name} className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">{p.name}</h2>
          <p className="text-sm text-muted">{p.note}</p>
          <p className="text-sm font-bold">{p.score}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Panel palette={p} theme="light" />
            <Panel palette={p} theme="dark" />
          </div>
        </section>
      ))}
    </main>
  );
}
