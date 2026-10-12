/* ── 看板的判断规则 ──
 * 全是纯函数，服务端和浏览器共用，也是单测覆盖的地方（tests/board.test.ts）。
 *
 * 三条规则，对应三种「看板在替你盯着的事」：
 *   在制品超限 · 卡片躺太久 · 到期没做完
 * 它们只陈述事实，不打分、不排名、不算连续天数——
 * 家族里其他几个 App 也是这个规矩：App 负责把欠账摆出来，不负责评价你。
 */
import { daysBetween, isoDateOf, shortDate, todayISO, weekdayLabel } from "./dates";
import type { Board, Card, CardView, ListView, Redline } from "./types";

/* ══ 在制品 ══ */

/** 这一列上活着的卡数（归档的不算） */
export function wipCount(list: { cards: { archivedAt: string | null }[] }): number {
  return list.cards.filter((c) => !c.archivedAt).length;
}

/**
 * 超没超上限。完成列永远不超——「做完的东西堆得多」不是问题，
 * 把上限套在完成列上只会让人不敢标完成。
 */
export function isOverWip(list: ListView): boolean {
  if (list.isDone || list.wipLimit == null) return false;
  return wipCount(list) > list.wipLimit;
}

/* ══ 卡龄 ══ */

/** 这张卡在当前列待了几天（东京时区的日历天） */
export function cardAgeDays(card: Pick<Card, "enteredListAt">, today = todayISO()): number {
  return Math.max(0, daysBetween(today, isoDateOf(card.enteredListAt)));
}

export type AgingLevel = "fresh" | "slow" | "stuck";

/**
 * 躺多久了。
 * `slow` 到达板设定的天数，`stuck` 是它的两倍——两档就够了，
 * 再细分只会变成一片渐变色，看的人分不出哪张更该管。
 *
 * 完成列不计龄：卡片在「完成」里待多久都没关系，那正是它该待的地方。
 */
export function agingLevel(
  card: Pick<Card, "enteredListAt">,
  list: Pick<ListView, "isDone">,
  board: Pick<Board, "agingDays">,
  today = todayISO()
): AgingLevel {
  if (list.isDone) return "fresh";
  const age = cardAgeDays(card, today);
  if (age >= board.agingDays * 2) return "stuck";
  if (age >= board.agingDays) return "slow";
  return "fresh";
}

/* ══ 到期 ══ */

export type DueState = "none" | "overdue" | "today" | "soon" | "later";

/** 三天内算「快到了」——再长就天天都是黄的，警示色一泛滥就没人看了。 */
export const SOON_DAYS = 3;

export function dueState(
  due: string | null,
  today = todayISO(),
  listIsDone = false
): DueState {
  // 做完的卡不谈逾期：一张上周就该交、昨天交掉了的卡，不该继续红着
  if (!due || listIsDone) return "none";
  const diff = daysBetween(due, today);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  return diff <= SOON_DAYS ? "soon" : "later";
}

/** 到期日的人话。一周内说星期几，再远就给日期。 */
export function dueLabel(due: string, today = todayISO()): string {
  const diff = daysBetween(due, today);
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === -1) return "昨天";
  if (diff < 0) return `逾期 ${-diff} 天`;
  if (diff <= 6) return weekdayLabel(due);
  return shortDate(due);
}

/** 分组标题用的紧迫字色：只有逾期和今天上色，别的档位不该抢眼 */
export const DUE_TEXT: Record<DueState, string> = {
  overdue: "text-cardinal",
  today: "text-fox-dark dark:text-fox",
  soon: "",
  later: "",
  none: "",
};

/** 到期状态对应的样式（完整类名，不拼字符串） */
export const DUE_STYLE: Record<Exclude<DueState, "none">, string> = {
  overdue: "bg-cardinal/20 text-cardinal",
  today: "bg-fox/20 text-fox-dark dark:text-fox",
  soon: "bg-bee/20 text-bee-dark dark:text-bee",
  later: "bg-[var(--track)] text-mid",
};

/* ══ 排序 ══ */

/**
 * 「我的卡片」的排序：先按紧迫（逾期 → 今天 → 快到 → 有期限 → 无期限），
 * 同档之内躺得久的排前面。
 *
 * 无期限的卡排在最后而不是最前：没定期限本身就是一种「不着急」的表态，
 * 让它插队会把真正到期的东西挤下去。
 */
const URGENCY: Record<DueState, number> = { overdue: 0, today: 1, soon: 2, later: 3, none: 4 };

export function compareUrgency(
  a: { dueDate: string | null; enteredListAt: string },
  b: { dueDate: string | null; enteredListAt: string },
  today = todayISO()
): number {
  const ua = URGENCY[dueState(a.dueDate, today)];
  const ub = URGENCY[dueState(b.dueDate, today)];
  if (ua !== ub) return ua - ub;
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  return a.enteredListAt < b.enteredListAt ? -1 : 1; // 老的在前
}

/* ══ 红线 ══ */

/**
 * 把一块板上的三种欠账收成红线条目。没有欠账就返回空数组——
 * 「一切正常」不需要一个绿色的卡片来庆祝。
 */
export function boardRedlines(
  board: Board & { lists: ListView[] },
  today = todayISO()
): Redline[] {
  const out: Redline[] = [];
  const href = `/b/${board.id}`;

  const over = board.lists.filter(isOverWip);
  for (const l of over) {
    out.push({
      kind: "wip",
      boardId: board.id,
      boardName: board.name,
      text: `「${l.name}」在制品 ${wipCount(l)} 张，你定的上限是 ${l.wipLimit}`,
      href,
      count: wipCount(l) - (l.wipLimit ?? 0),
    });
  }

  const stuck = board.lists.flatMap((l) =>
    l.cards.filter((c) => !c.archivedAt && agingLevel(c, l, board, today) === "stuck")
  );
  if (stuck.length) {
    out.push({
      kind: "stale",
      boardId: board.id,
      boardName: board.name,
      text: `${stuck.length} 张卡在原地超过 ${board.agingDays * 2} 天没动过`,
      href,
      count: stuck.length,
    });
  }

  const overdue = board.lists.flatMap((l) =>
    l.cards.filter((c) => !c.archivedAt && dueState(c.dueDate, today, l.isDone) === "overdue")
  );
  if (overdue.length) {
    out.push({
      kind: "overdue",
      boardId: board.id,
      boardName: board.name,
      text: `${overdue.length} 张卡已经过了到期日`,
      href,
      count: overdue.length,
    });
  }

  return out;
}

export const REDLINE_STYLE: Record<Redline["kind"], { icon: string; tint: string }> = {
  wip: { icon: "▨", tint: "text-cardinal" },
  stale: { icon: "◷", tint: "text-fox-dark dark:text-fox" },
  overdue: { icon: "!", tint: "text-cardinal" },
};

