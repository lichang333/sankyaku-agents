/* ── 三脚看板 领域模型 ──
 * 看板不是待办清单。待办清单鼓励你不停地加，看板逼你先把手上的做完——
 * 这个区别落在数据模型上就是两件事：
 *   1. 列有 WIP 上限（`List.wipLimit`），超了要说话
 *   2. 卡片记「什么时候进的这一列」（`Card.enteredListAt`），躺太久要说话
 * 没有这两样，它就只是个横过来的清单。
 */

export interface User {
  id: string;
  displayName: string;
  /** 管理员可以建板、删板、改别人的卡。小组是主人开的，所以要分权。 */
  isAdmin: boolean;
}

/**
 * 板的可见性。
 * `group`：所有成员都看得到——小组共用的默认形态。
 * `private`：只有创建者看得到，用来放自己的东西。
 *
 * 刻意不做「每块板挑成员」那套：这是几个人的小组，
 * 一套细粒度权限系统的维护成本远大于它挡住的那点尴尬。
 */
export type Visibility = "group" | "private";

export interface Board {
  id: number;
  name: string;
  description: string | null;
  visibility: Visibility;
  /** 卡片在同一列待过几天算「躺太久」。板级设置，默认 7。 */
  agingDays: number;
  createdBy: string;
  createdAt: string;
  archivedAt: string | null;
}

export interface List {
  id: number;
  boardId: number;
  name: string;
  pos: number;
  /**
   * 在制品上限。null = 不限。
   * 超限不拦你——拦住只会让人把卡塞进别的列糊弄过去。
   * 它只负责把「你自己定的上限是 3，现在有 5 张」摆在最显眼的地方。
   */
  wipLimit: number | null;
  /** 完成列。进了这列的卡停止计龄，也不算在制品。 */
  isDone: boolean;
  archivedAt: string | null;
}

export interface Card {
  id: number;
  boardId: number;
  listId: number;
  title: string;
  body: string | null;
  pos: number;
  assigneeId: string | null;
  /** 到期日，YYYY-MM-DD（东京时区）。null = 没有期限。 */
  dueDate: string | null;
  createdBy: string;
  createdAt: string;
  /**
   * 进入当前列的时间。卡龄从这里算，不从 createdAt 算——
   * 一张昨天刚从「待办」拖进「进行中」的卡，不该因为两个月前建的就显示「躺了 60 天」。
   */
  enteredListAt: string;
  archivedAt: string | null;
}

/* ── 标签 ──
 * 颜色写成完整类名，不拼字符串：Tailwind 是扫源码生成 CSS 的，
 * `bg-${color}` 这种写法扫不到，上线后颜色会整片消失。
 */
export const LABEL_COLORS = [
  { key: "feather", label: "绿", bar: "bg-feather", chip: "bg-feather/20 text-feather-dark dark:text-feather", dot: "bg-feather" },
  { key: "macaw", label: "蓝", bar: "bg-macaw", chip: "bg-macaw/20 text-macaw", dot: "bg-macaw" },
  { key: "bee", label: "黄", bar: "bg-bee", chip: "bg-bee/20 text-bee-dark dark:text-bee", dot: "bg-bee" },
  { key: "fox", label: "橙", bar: "bg-fox", chip: "bg-fox/20 text-fox-dark dark:text-fox", dot: "bg-fox" },
  { key: "cardinal", label: "红", bar: "bg-cardinal", chip: "bg-cardinal/20 text-cardinal", dot: "bg-cardinal" },
  { key: "beetle", label: "紫", bar: "bg-beetle", chip: "bg-beetle/20 text-beetle-dark dark:text-beetle", dot: "bg-beetle" },
  { key: "hare", label: "灰", bar: "bg-hare", chip: "bg-hare/20 text-mid", dot: "bg-hare" },
] as const;

export type LabelColor = (typeof LABEL_COLORS)[number]["key"];

import type { CSSProperties } from "react";

export const isHexColor = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

/**
 * 自定义色的前景色：亮底配深字、暗底配白字。
 * 七个预设色是逐个手配过对比度的；放开成任意 hex 之后这条规则必须有人接——
 * 不然有人选个 #ffe94d，标签章就成了白字浅黄底，谁都读不出来。
 */
export function hexFg(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? "#3c3c3c" : "#ffffff";
}

/**
 * 标签章的成品样式（选中 = 实底，未选中 = 浅底）。
 * 卡片页的选择器和板的筛选条都从这里拿——同一个标签在两处长得不一样，
 * 是这个函数存在要防的第一件事。
 */
export function labelChipStyle(
  color: string,
  active: boolean
): { className: string; style?: CSSProperties } {
  const s = labelStyle(color);
  if (!s.custom) return { className: active ? `${s.bar} text-white` : s.chip };
  return active
    ? { className: "", style: { backgroundColor: s.custom, color: hexFg(s.custom) } }
    : {
        className: "",
        style: {
          backgroundColor: `${s.custom}2e`,
          // 未选中的字色把 hex 往前景色上掺一把，深浅两个主题都读得出来
          color: `color-mix(in srgb, ${s.custom} 65%, var(--text))`,
        },
      };
}

/** 标签颜色合法值：预设 key，或自定义 #RRGGBB */
export const isValidLabelColor = (v: string) =>
  LABEL_COLORS.some((c) => c.key === v) || isHexColor(v);

/**
 * 预设色走 Tailwind 类（构建期扫得到），自定义 hex 走内联样式（custom 字段）。
 * 认不出来的脏值退回灰色，不让一条脏数据把整页渲染打崩。
 */
export function labelStyle(color: string): {
  bar: string;
  chip: string;
  dot: string;
  custom: string | null;
} {
  const preset = LABEL_COLORS.find((c) => c.key === color);
  if (preset) return { bar: preset.bar, chip: preset.chip, dot: preset.dot, custom: null };
  if (isHexColor(color)) return { bar: "", chip: "", dot: "", custom: color };
  const gray = LABEL_COLORS[6];
  return { bar: gray.bar, chip: gray.chip, dot: gray.dot, custom: null };
}

export interface Label {
  id: number;
  boardId: number;
  name: string;
  /** 预设 key（"cardinal" 等）或自定义 "#RRGGBB" */
  color: string;
}

/** 卡片里的小清单。一张卡拆几步就够了，不做嵌套子卡片。 */
export interface CheckItem {
  id: number;
  cardId: number;
  text: string;
  done: boolean;
  pos: number;
}

export interface Comment {
  id: number;
  cardId: number;
  userId: string;
  text: string;
  createdAt: string;
}

/**
 * 卡片事件。既是这张卡的履历，也是全站动态流的数据源。
 * 从底表现算也行，但「谁在什么时候把它从哪儿挪到哪儿」是移动那一刻才有的信息，
 * 事后没法从 cards 表反推出来。
 */
export type EventType =
  | "create"
  | "move"
  | "assign"
  | "due"
  | "comment"
  | "archive"
  | "restore"
  | "rename";

export interface CardEvent {
  id: number;
  cardId: number;
  boardId: number;
  userId: string;
  type: EventType;
  /** 移动事件的来去列名（存名字而不是 id：列改名或删了，历史还读得懂） */
  fromList: string | null;
  toList: string | null;
  text: string | null;
  createdAt: string;
}

/* ── 视图模型：页面直接用的形状 ── */

/** 板上渲染一张卡需要的全部东西，一次查完，不在渲染时补查 */
export interface CardView extends Card {
  labels: Label[];
  checkDone: number;
  checkTotal: number;
  commentCount: number;
}

export interface ListView extends List {
  cards: CardView[];
}

export interface BoardView extends Board {
  lists: ListView[];
  labels: Label[];
}

/** 首页板卡片上的一行摘要 */
export interface BoardSummary extends Board {
  cardCount: number;
  mineCount: number;
  overdue: number;
  wipBreaches: number;
  stale: number;
}

/* ── 红线 ──
 * 家族里学习版和健身版都有「红线」：不是奖励你做得好，是明确指出你欠了什么。
 * 看板的红线有三种，全部只描述事实，不给分数、不排名、没有连续天数。
 */
export type RedlineKind = "wip" | "stale" | "overdue";

export interface Redline {
  kind: RedlineKind;
  boardId: number;
  boardName: string;
  /** 一句话说清是什么事 */
  text: string;
  /** 点过去看哪里 */
  href: string;
  count: number;
}

/** 可选头像：三足乌 + 不同配饰（沿用三脚家族的吉祥物） */
export const AVATARS = [
  { key: "note", label: "便利贴" },
  { key: "pencil", label: "铅笔" },
  { key: "glasses", label: "圆眼镜" },
  { key: "cap", label: "蓝帽" },
  { key: "bow", label: "蝴蝶结" },
  { key: "flower", label: "小花" },
  { key: "scarf", label: "围巾" },
  { key: "crown", label: "小皇冠" },
  { key: "beanie", label: "毛线帽" },
  { key: "sunglasses", label: "墨镜" },
  { key: "headphones", label: "耳机" },
  { key: "hachimaki", label: "钵卷" },
  { key: "plain", label: "素颜" },
] as const;

export type AvatarKey = (typeof AVATARS)[number]["key"];

export const DEFAULT_AVATAR: Record<string, AvatarKey> = {
  admin: "note",
};

/** 种子成员：小组主人。其他人凭邀请链接加入。 */
export const USERS: User[] = [
  { id: "admin", displayName: "管理员", isAdmin: true },
];
