import { describe, expect, it } from "vitest";
import {
  agingLevel,
  boardRedlines,
  cardAgeDays,
  compareUrgency,
  dueLabel,
  dueState,
  isOverWip,
  wipCount,
} from "@/lib/board";
import type { Board, CardView, ListView } from "@/lib/types";

const TODAY = "2026-08-31";

const card = (p: Partial<CardView> = {}): CardView => ({
  id: 1,
  boardId: 1,
  listId: 1,
  title: "做点什么",
  body: null,
  pos: 1024,
  assigneeId: null,
  dueDate: null,
  createdBy: "admin",
  createdAt: "2026-08-01T00:00:00Z",
  enteredListAt: "2026-08-31T00:00:00Z",
  archivedAt: null,
  labels: [],
  checkDone: 0,
  checkTotal: 0,
  commentCount: 0,
  ...p,
});

const list = (p: Partial<ListView> = {}): ListView => ({
  id: 1,
  boardId: 1,
  name: "进行中",
  pos: 1024,
  wipLimit: null,
  isDone: false,
  archivedAt: null,
  cards: [],
  ...p,
});

const board: Board = {
  id: 1,
  name: "上线前",
  description: null,
  visibility: "group",
  agingDays: 7,
  createdBy: "admin",
  createdAt: "2026-08-01T00:00:00Z",
  archivedAt: null,
};

describe("在制品上限", () => {
  it("归档的卡不算在制品", () => {
    const l = list({
      wipLimit: 2,
      cards: [card({ id: 1 }), card({ id: 2 }), card({ id: 3, archivedAt: "2026-08-30T00:00:00Z" })],
    });
    expect(wipCount(l)).toBe(2);
    expect(isOverWip(l)).toBe(false);
  });

  it("超过上限才算超，等于不算", () => {
    expect(isOverWip(list({ wipLimit: 2, cards: [card({ id: 1 }), card({ id: 2 })] }))).toBe(false);
    expect(
      isOverWip(list({ wipLimit: 2, cards: [card({ id: 1 }), card({ id: 2 }), card({ id: 3 })] }))
    ).toBe(true);
  });

  it("没设上限就永远不超", () => {
    expect(isOverWip(list({ wipLimit: null, cards: [card(), card(), card()] }))).toBe(false);
  });

  it("完成列不受上限约束——做完的堆多少都不是问题", () => {
    const done = list({ isDone: true, wipLimit: 1, cards: [card({ id: 1 }), card({ id: 2 })] });
    expect(isOverWip(done)).toBe(false);
  });
});

describe("卡龄", () => {
  it("按进入这一列的时间算，不按建卡时间", () => {
    const c = card({ createdAt: "2026-01-01T00:00:00Z", enteredListAt: "2026-08-29T00:00:00Z" });
    expect(cardAgeDays(c, TODAY)).toBe(2);
  });

  it("到板设定的天数算慢，两倍算卡住", () => {
    const at = (iso: string) => agingLevel(card({ enteredListAt: iso }), list(), board, TODAY);
    expect(at("2026-08-28T00:00:00Z")).toBe("fresh"); // 3 天
    expect(at("2026-08-24T00:00:00Z")).toBe("slow"); // 7 天
    expect(at("2026-08-17T00:00:00Z")).toBe("stuck"); // 14 天
  });

  it("完成列里的卡不计龄", () => {
    expect(
      agingLevel(card({ enteredListAt: "2026-01-01T00:00:00Z" }), list({ isDone: true }), board, TODAY)
    ).toBe("fresh");
  });
});

describe("到期", () => {
  it("过了就是逾期，当天是今天，三天内是快到了", () => {
    expect(dueState("2026-08-30", TODAY)).toBe("overdue");
    expect(dueState("2026-08-31", TODAY)).toBe("today");
    expect(dueState("2026-09-03", TODAY)).toBe("soon");
    expect(dueState("2026-09-04", TODAY)).toBe("later");
    expect(dueState(null, TODAY)).toBe("none");
  });

  it("进了完成列就不再谈逾期——昨天交掉的东西不该继续红着", () => {
    expect(dueState("2026-08-01", TODAY, true)).toBe("none");
  });

  it("到期日说人话", () => {
    expect(dueLabel("2026-08-31", TODAY)).toBe("今天");
    expect(dueLabel("2026-09-01", TODAY)).toBe("明天");
    expect(dueLabel("2026-08-30", TODAY)).toBe("昨天");
    expect(dueLabel("2026-08-25", TODAY)).toBe("逾期 6 天");
    expect(dueLabel("2026-09-03", TODAY)).toBe("周四");
    expect(dueLabel("2026-10-20", TODAY)).toBe("10.20");
  });
});

describe("紧迫排序", () => {
  it("逾期排最前，没期限的排最后", () => {
    const cards = [
      card({ id: 1, dueDate: null }),
      card({ id: 2, dueDate: "2026-08-20" }),
      card({ id: 3, dueDate: "2026-09-20" }),
      card({ id: 4, dueDate: "2026-08-31" }),
    ];
    const order = [...cards].sort((a, b) => compareUrgency(a, b, TODAY)).map((c) => c.id);
    expect(order).toEqual([2, 4, 3, 1]);
  });

  it("同一档里躺得久的排前面", () => {
    const old = card({ id: 1, enteredListAt: "2026-08-01T00:00:00Z" });
    const fresh = card({ id: 2, enteredListAt: "2026-08-30T00:00:00Z" });
    expect([fresh, old].sort((a, b) => compareUrgency(a, b, TODAY)).map((c) => c.id)).toEqual([1, 2]);
  });
});

describe("红线", () => {
  it("没欠账就一条都不出——「一切正常」不需要一张卡片来庆祝", () => {
    expect(boardRedlines({ ...board, lists: [list({ cards: [card()] })] }, TODAY)).toEqual([]);
  });

  it("超限、卡死、逾期各出一条", () => {
    const lists = [
      list({
        id: 1,
        name: "进行中",
        wipLimit: 1,
        cards: [
          card({ id: 1, enteredListAt: "2026-08-01T00:00:00Z" }), // 30 天 → stuck
          card({ id: 2, dueDate: "2026-08-01" }), // 逾期
        ],
      }),
    ];
    const rl = boardRedlines({ ...board, lists }, TODAY);
    expect(rl.map((r) => r.kind).sort()).toEqual(["overdue", "stale", "wip"]);
    expect(rl.find((r) => r.kind === "wip")!.text).toContain("上限是 1");
  });

  it("归档的卡不进红线", () => {
    const lists = [
      list({ cards: [card({ id: 1, dueDate: "2026-01-01", archivedAt: "2026-08-30T00:00:00Z" })] }),
    ];
    expect(boardRedlines({ ...board, lists }, TODAY)).toEqual([]);
  });
});
