import type { MetadataRoute } from "next";

// ホーム画面に追加した時の、アプリとしての情報
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "つなぐメモ",
    short_name: "つなぐメモ",
    description: "大切にしたいことを、一緒に何度でも思い出すためのメモ",
    lang: "ja",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
