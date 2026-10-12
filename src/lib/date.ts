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
