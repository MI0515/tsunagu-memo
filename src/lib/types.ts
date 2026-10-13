export type Memo = {
  id: string;
  room_id: string;
  title: string;
  description: string | null;
  position: number;
  created_at: string;
};

export type MemoSummary = Memo & { item_count: number };

export type MemoItem = {
  id: string;
  memo_id: string;
  room_id: string;
  body: string;
  position: number;
  created_at: string;
};

// 文字数・数の上限（データベースの決まりと同じ）
export const LIMITS = {
  memoTitle: 30,
  memoDescription: 200,
  memoItem: 80,
  memosPerRoom: 10,
  itemsPerMemo: 30,
} as const;

export type Member = {
  user_id: string;
  display_name: string;
  role: "owner" | "member";
  color: number | null;
  emoji: string | null;
  left_at: string | null;
};

export type DayEntry = {
  id: string;
  room_id: string;
  date: string;
  body: string;
  memo_item_id: string | null;
  position: number;
  created_at: string;
};

export type Check = {
  entry_id: string;
  slot: "morning" | "night";
  user_id: string;
  room_id: string;
  date: string;
  created_at: string;
};

export const ENTRY_MAX = 80;

export type ReflectionNote = {
  id: string;
  reflection_id: string;
  room_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type Reflection = {
  id: string;
  room_id: string;
  date: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  reflection_notes: ReflectionNote[];
};

export const REFLECTION_MAX = 2000;
export const NOTE_MAX = 1000;
