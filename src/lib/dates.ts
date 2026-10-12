/* ── 日期工具：时区固定 Asia/Tokyo ──
 * 「今天到期」「躺了几天」都以东京时间为准（无夏令时，UTC+9 恒定），
 * 服务器时区怎么设都不影响判断。
 */

const JST_OFFSET_MS = 9 * 3600_000;

/** 东京时间的今天，YYYY-MM-DD */
export function todayISO(now: Date = new Date()): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function utc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** 1=周一 … 7=周日 */
export function dayOfWeek(iso: string): number {
  const d = new Date(utc(iso)).getUTCDay(); // 0=Sun
  return d === 0 ? 7 : d;
}

export function addDays(iso: string, days: number): string {
  return new Date(utc(iso) + days * 86400_000).toISOString().slice(0, 10);
}

/** 所在周的周一 */
export function weekStart(iso: string): string {
  return addDays(iso, 1 - dayOfWeek(iso));
}

/** a - b 的整天数 */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(a) - utc(b)) / 86400_000);
}

/** "2026-08-31" → "8.31" */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}.${d}`;
}

export const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function weekdayLabel(iso: string): string {
  return WEEKDAYS[dayOfWeek(iso) - 1];
}

/**
 * 动态流和履历里的相对时间。「刚刚 / 3 小时前 / 昨天 / 8.20」。
 * 超过一周就直接给日期——「11 天前」没人算得清是哪天。
 */
export function relTime(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < 0) return "刚刚";
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  // 过了 24 小时改按东京日历日数：周六晚上的事周一早上看是「2 天前」，
  // 不是 floor(38h/24h)=1 得出来的「昨天」——「昨天」这个词只认日历，不认时长
  const day = daysBetween(todayISO(now), todayISO(new Date(iso)));
  if (day <= 1) return "昨天";
  if (day < 7) return `${day} 天前`;
  return shortDate(todayISO(new Date(iso)));
}

/** 时间戳 → 东京时区的日期。卡龄要按「日历天」算，不按 24 小时算。 */
export function isoDateOf(timestamp: string): string {
  return todayISO(new Date(timestamp));
}
