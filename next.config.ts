import type { NextConfig } from "next";

// 開発中（npm run dev）だけ、`page.dev.tsx` という名前のファイルもページとして扱う。
// デザインの試作など、本番・デモの公開版に含めたくない確認用ページに使う。
const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // 開発中に画面の隅に出る Next.js のマークを出さない（スマホで試す時にタブと重なるため）
  devIndicators: false,
  pageExtensions: isDev ? ["dev.tsx", "tsx", "ts", "jsx", "js"] : ["tsx", "ts", "jsx", "js"],
};

export default nextConfig;
