// 前回選んでいたルームを覚えておく（この端末だけ）
const LAST_ROOM_KEY = "tsunagu:lastRoom";

export function readLastRoom(): string | null {
  try {
    return localStorage.getItem(LAST_ROOM_KEY);
  } catch {
    return null;
  }
}

export function saveLastRoom(id: string) {
  try {
    localStorage.setItem(LAST_ROOM_KEY, id);
  } catch {
    // 保存できない環境でも、そのまま使える
  }
}
