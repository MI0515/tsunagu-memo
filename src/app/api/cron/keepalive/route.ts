import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// 毎日1回、Vercel Cron が呼ぶ。
// - データベースに生存記録を書き、Supabase 無料プランの一時停止（7日間使われないと止まる）を防ぐ
// - 古いロック記録などを片づけ、使われないルームを整理する
// - どのルームにも入っていない、30日以上前の匿名ユーザーを削除する
// 合言葉（CRON_SECRET）を知っている呼び出しだけを受け付ける。Vercel Cron は自動で付けてくれる。

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 500 });
  }

  // サーバーだけが使える秘密のキーでつなぐ（ブラウザには渡さない）
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  // Vercel Cron からの呼び出しかどうかで、生存記録の名前を分ける（手で試した時は manual）
  const source = request.headers.get("user-agent")?.startsWith("vercel-cron") ? "vercel-cron" : "manual";

  const { data: maintenance, error } = await admin.rpc("run_daily_maintenance", { p_source: source });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const { data: orphans, error: listError } = await admin.rpc("list_orphan_anonymous_users", { p_limit: 100 });
  let deletedUsers = 0;
  if (!listError) {
    for (const id of (orphans ?? []) as string[]) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(id);
      if (!deleteError) deletedUsers++;
    }
  }

  return NextResponse.json({ ok: true, source, maintenance, deletedUsers });
}
