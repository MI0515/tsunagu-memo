export type ItemKind = "once" | "daily" | "weekly" | "monthly";

export type Item = {
  id: string;
  room_id: string;
  title: string;
  kind: ItemKind;
  date: string | null;
  weekdays: number[] | null;
  month_day: number | null;
  starts_on: string;
  ends_on: string | null;
  position: number;
  created_at: string;
};

export type StampKind = "check" | "eyes" | "pray" | "heart";

export type Stamp = {
  item_id: string;
  date: string;
  user_id: string;
  kind: StampKind;
  room_id: string;
  created_at: string;
};

export type Member = {
  user_id: string;
  display_name: string;
  role: "owner" | "member";
};

export const STAMPS: { kind: StampKind; emoji: string; label: string }[] = [
  { kind: "check", emoji: "✅", label: "できた" },
  { kind: "eyes", emoji: "👀", label: "見たよ" },
  { kind: "pray", emoji: "🙏", label: "おねがい" },
  { kind: "heart", emoji: "💙", label: "ありがとう" },
];
