// 日付はすべて日本時間の "YYYY-MM-DD" 文字列で扱う

const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function jstToday(): string {
  return ymd.format(new Date());
}

// "YYYY-MM-DD" を、時差の影響を受けない形で Date にする
function parse(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayOfMonth(date: string): number {
  return parse(date).getUTCDate();
}

// 例：10月13日（火）
export function formatDay(date: string): string {
  return parse(date).toLocaleDateString("ja-JP", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

// 例：9:05
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// 今年なら「10月13日（火）」、それ以外は「2025年10月13日（月）」
export function formatDayWithYear(date: string): string {
  const sameYear = date.slice(0, 4) === jstToday().slice(0, 4);
  return parse(date).toLocaleDateString("ja-JP", {
    timeZone: "UTC",
    ...(sameYear ? {} : { year: "numeric" }),
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

// 月は "YYYY-MM" で扱う
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(month: string, months: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 7);
}

// その月の初日と末日
export function monthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  const to = addDays(`${addMonths(month, 1)}-01`, -1);
  return { from, to };
}

// 例：2026年10月
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}年${m}月`;
}
