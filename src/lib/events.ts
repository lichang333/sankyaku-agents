/* 履历和动态流里，一条事件怎么说成人话。
 * 放在一处，是为了卡片履历和全站动态流用的是同一套措辞——
 * 同一件事在两个页面上有两种说法，读的人会以为是两件事。
 */
import type { CardEvent } from "./types";

export function describeEvent(e: Pick<CardEvent, "type" | "fromList" | "toList" | "text">): string {
  switch (e.type) {
    case "create":
      return e.toList ? `建了这张卡，放进「${e.toList}」` : "建了这张卡";
    case "move":
      return e.fromList ? `从「${e.fromList}」挪到「${e.toList}」` : `挪到「${e.toList}」`;
    case "assign":
      return e.text ? `把它派给了 ${e.text}` : "取消了负责人";
    case "due":
      return e.text ? `把到期日定在 ${e.text}` : "清掉了到期日";
    case "comment":
      return e.text ? `留言：${e.text}` : "留了言";
    case "archive":
      return "归档了这张卡";
    case "restore":
      return "把它从归档里取回";
    case "rename":
      return e.text ? `改名为「${e.text}」` : "改了标题";
  }
}

/** 动态流里的一行：谁 + 做了什么 + 在哪张卡上 */
export const EVENT_ICON: Record<CardEvent["type"], string> = {
  create: "＋",
  move: "→",
  assign: "👤",
  due: "📅",
  comment: "💬",
  archive: "🗄",
  restore: "↩︎",
  rename: "✏️",
};
