export type Memo = {
  id: string;
  room_id: string;
  title: string;
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
  memoItem: 80,
  memosPerRoom: 10,
  itemsPerMemo: 30,
} as const;
