import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

// デモの見本ルームに、見本の相手と見本のデータを入れる（デモ環境だけ）。
// 呼び出した本人が作成者で、まだ本人ひとりだけのルームにしか入れない（データベース側でも確かめる）。

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_APP_MODE !== "demo") {
    return NextResponse.json({ ok: false, error: "not_demo" }, { status: 404 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 500 });

  const accessToken = request.headers.get("authorization")?.replace(/^Bearer /, "");
  const body = (await request.json().catch(() => null)) as { roomId?: string } | null;
  if (!accessToken || !body?.roomId) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // ログインしている本人を確かめる
  const { data: auth, error: authError } = await admin.auth.getUser(accessToken);
  if (authError || !auth.user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  // 本人がそのルームの作成者で、まだひとりだけか
  const { data: members, error: membersError } = await admin
    .from("room_members").select("user_id, role").eq("room_id", body.roomId);
  if (membersError) return NextResponse.json({ ok: false, error: membersError.message }, { status: 500 });
  const isOnlyOwner = members?.length === 1 && members[0].user_id === auth.user.id && members[0].role === "owner";
  if (!isOnlyOwner) return NextResponse.json({ ok: false, error: "not_allowed" }, { status: 403 });

  // 見本の相手（毎日の片づけで消えるよう、目印を付ける。メールは届かない宛先）
  const { data: partner, error: partnerError } = await admin.auth.admin.createUser({
    email: `demo-partner-${randomUUID()}@demo.invalid`,
    email_confirm: true,
    user_metadata: { demo_partner: "true" },
  });
  if (partnerError || !partner.user) {
    return NextResponse.json({ ok: false, error: partnerError?.message ?? "partner" }, { status: 500 });
  }

  const { data: seeded, error: seedError } = await admin.rpc("seed_demo_room", {
    p_room_id: body.roomId,
    p_partner_id: partner.user.id,
  });
  if (seedError || !(seeded as { ok?: boolean } | null)?.ok) {
    await admin.auth.admin.deleteUser(partner.user.id);
    return NextResponse.json({ ok: false, error: seedError?.message ?? (seeded as { error?: string }).error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
