// DB関数などが返すエラーの合言葉を、やさしい日本語にする
const MESSAGES: Record<string, string> = {
  bad_code: "作成用コードが違うようです。もう一度確かめてください。",
  locked: "続けて失敗したため、少しのあいだ止めています。10分ほど待ってから試してください。",
  too_many_rooms: "作れるルームの数の上限に達しています。",
  service_full: "いまは新しいルームを作れません。運営者に相談してください。",
  invalid_invite: "この招待リンクは使えないようです。リンクが途中で切れていないか確かめてください。",
  expired_invite: "この招待リンクは期限が切れています。ルームの作成者に、新しいリンクをお願いしてください。",
  room_full: "このルームは人数の上限に達しています。",
  not_owner: "この操作は、ルームの作成者だけができます。",
  not_member: "このルームのメンバーではないため、操作できません。",
  not_signed_in: "準備がうまくいきませんでした。ページを読み込み直してください。",
  captcha_failed: "ロボットでないことの確認がうまくいきませんでした。少し待ってから、もう一度押してください。",
  rate_limited: "短いあいだに何度も試されたため、少し待ってから試してください。",
  signin_failed: "準備がうまくいきませんでした。通信の状態を確かめて、もう一度試してください。",
  bad_date: "追加できるのは、今日と明日だけです。",
  nothing_selected: "項目を1つ以上選んでください。",
  color_taken: "その色は、ほかのメンバーが使っています。別の色を選んでください。",
  bad_look: "色か絵文字の選び方が正しくありません。",
  transfer_first: "作成者が退出する前に、ほかのメンバーに作成者を譲ってください。",
  name_mismatch: "入力したルーム名が一致しません。もう一度確かめてください。",
  cannot_remove_self: "自分自身を外すことはできません。退出を使ってください。",
  invalid_secret: "コードが違うか、期限（10分）が切れています。Safariの「設定」で、もう一度発行してください。",
  limit_reached: "数の上限に達しているため、これ以上追加できません。",
  too_long: "文字数が多すぎます。短くしてください。",
  not_found: "見つかりませんでした。ほかの人が先に消したのかもしれません。",
  network: "通信がうまくいきませんでした。電波の状態を確かめて、もう一度試してください。",
};

export class AppError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

// Supabase のエラーを、画面で使う合言葉にそろえる
export function toAppError(error: { code?: string; message?: string }): AppError {
  const message = error.message ?? "";
  if (message.includes("limit_reached")) return new AppError("limit_reached");
  if (error.code === "23514") return new AppError("too_long"); // 文字数などの決まりに合わない
  return new AppError(message || "unknown");
}

export function errorMessage(e: unknown): string {
  if (e instanceof AppError) return MESSAGES[e.code] ?? "うまくいきませんでした。もう一度試してください。";
  if (e instanceof TypeError) return MESSAGES.network; // fetch の失敗
  return "うまくいきませんでした。もう一度試してください。";
}
