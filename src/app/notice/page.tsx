import type { Metadata } from "next";
import Link from "next/link";
import { AppTitle, Card, Page } from "@/components/ui";

export const metadata: Metadata = { title: "ご利用の前に｜つなぐメモ" };

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "運営者からデータが見えることについて",
    body: [
      "つなぐメモのデータは、Supabase というサービスに保存しています。仕組み上、運営者はその管理画面から、ルームの名前・チェック項目・スタンプ・定型文などの中身を見ることができます。",
      "運営者は、不具合の調査など必要な場合を除いて、中身は見ない方針です。",
    ],
  },
  {
    title: "書かないでほしいこと",
    body: [
      "住所、電話番号、パスワード、体調や病気の詳しい内容など、知られると困る情報は書かないでください。",
    ],
  },
  {
    title: "無料で運用していること",
    body: [
      "このアプリは、個人が無料の範囲で運用しています。予告なく止まったり、データが消えたりする可能性があります。",
      "大切な記録は、設定画面の「記録を書き出す」から、ときどき保存しておくと安心です。",
    ],
  },
  {
    title: "使われていないルームの整理",
    body: [
      "150日間記録がないルームには、ホームでお知らせを出します。180日間記録がないと、⭐を付けていない日の記録は自動で削除されます。⭐が1つもないルームは、ルームごと削除されます。",
    ],
  },
  {
    title: "端末を変える時・データを消す時",
    body: [
      "このアプリは、メールアドレスやパスワードを使わずにログインしています。機種変更やブラウザのデータ消去の前に、設定画面の「復元リンク」を発行して、自分だけが見られる場所に保存してください。",
      "復元リンクを知っている人は、あなたとして参加できてしまいます。人に見せないでください。",
    ],
  },
  {
    title: "招待リンクについて",
    body: [
      "招待リンクを知っている人は、有効期限（7日間）のあいだ、だれでもルームに参加できます。送る相手を間違えた時は、作成者が設定画面からリンクを作り直すと、古いリンクは使えなくなります。",
      "ルームの作成者は、メンバーを外すことができます。",
    ],
  },
  {
    title: "困った時・やめたい時",
    body: [
      "ルームから抜けたい時は、設定画面の「ルームから退出」を使ってください。",
      "そのほか困った時は、招待してくれた人か、運営者に直接相談してください。",
    ],
  },
];

export default function NoticePage() {
  return (
    <Page>
      <AppTitle sub="ご利用の前に" />
      {SECTIONS.map((s) => (
        <Card key={s.title} className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">{s.title}</h2>
          {s.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </Card>
      ))}
      <Link href="/" className="text-center text-primary underline underline-offset-4">トップへ</Link>
    </Page>
  );
}
