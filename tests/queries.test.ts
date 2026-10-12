import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDbForTests } from "@/lib/db";
import {
  archiveCard,
  assignedTo,
  canSeeBoard,
  cardEvents,
  createBoard,
  createCard,
  createLabel,
  createList,
  createUser,
  dueTodayFor,
  feed,
  getBoardView,
  getBoardViews,
  getCard,
  getLabels,
  getLists,
  listBoards,
  moveCard,
  moveList,
} from "@/lib/queries";

/* 每个用例开一个干净的库。KANBAN_DATA_DIR 由 vitest.config.ts 指到 tests/.tmp。 */
const DIR = process.env.KANBAN_DATA_DIR!;

beforeEach(() => {
  resetDbForTests();
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
  db(); // 建表 + 播种主用户
});

const newBoard = (over: Partial<Parameters<typeof createBoard>[0]> = {}) =>
  createBoard({ name: "上线前", createdBy: "admin", ...over });

describe("建板", () => {
  it("自带三列，进行中预设上限 3，完成列标成完成", () => {
    const lists = getLists(newBoard());
    expect(lists.map((l) => l.name)).toEqual(["待办", "进行中", "完成"]);
    expect(lists[1].wipLimit).toBe(3);
    expect(lists[2].isDone).toBe(true);
    expect(lists[0].isDone).toBe(false);
  });

  it("自带三个标签", () => {
    expect(getLabels(newBoard()).map((l) => l.name)).toEqual(["紧急", "等别人", "小事"]);
  });

  it("标签颜色可以存自定义 hex，取回原样", () => {
    const boardId = newBoard();
    const id = createLabel(boardId, "品牌色", "#ff6600");
    expect(getLabels(boardId).find((l) => l.id === id)?.color).toBe("#ff6600");
  });
});

describe("可见性", () => {
  it("私人板只有主人看得见，管理员也不行——私人就是私人", () => {
    createUser("siyi_li", "Siyi Li", "x");
    const priv = newBoard({ visibility: "private" });
    const open = newBoard({ name: "全组的" });

    expect(listBoards("admin").map((b) => b.id).sort()).toEqual([priv, open].sort());
    expect(listBoards("siyi_li").map((b) => b.id)).toEqual([open]);

    const board = listBoards("admin").find((b) => b.id === priv)!;
    expect(canSeeBoard(board, "admin")).toBe(true);
    expect(canSeeBoard(board, "siyi_li")).toBe(false);
  });
});

describe("移动卡片", () => {
  it("换列会重置卡龄起点，并留下一条履历", () => {
    const boardId = newBoard();
    const [todo, doing] = getLists(boardId);
    const cardId = createCard({ listId: todo.id, title: "接口联调", createdBy: "admin" });

    // 假装它在待办里躺了很久
    const long_ago = "2026-01-01T00:00:00.000Z";
    db().prepare("UPDATE cards SET entered_list_at = ? WHERE id = ?").run(long_ago, cardId);

    moveCard(cardId, doing.id, 0, "admin");

    const card = getCard(cardId)!;
    expect(card.listId).toBe(doing.id);
    expect(card.enteredListAt).not.toBe(long_ago);

    const move = cardEvents(cardId).find((e) => e.type === "move")!;
    expect(move.fromList).toBe("待办");
    expect(move.toList).toBe("进行中");
  });

  it("列内调顺序不重置卡龄——「拖到列首以示重要」不该抹掉停滞记录", () => {
    const boardId = newBoard();
    const [todo] = getLists(boardId);
    const a = createCard({ listId: todo.id, title: "A", createdBy: "admin" });
    const b = createCard({ listId: todo.id, title: "B", createdBy: "admin" });

    const long_ago = "2026-01-01T00:00:00.000Z";
    db().prepare("UPDATE cards SET entered_list_at = ? WHERE id = ?").run(long_ago, b);

    moveCard(b, todo.id, 0, "admin"); // 挪到 A 前面，还是同一列

    expect(getCard(b)!.enteredListAt).toBe(long_ago);
    expect(cardEvents(b).some((e) => e.type === "move")).toBe(false);
    expect(getBoardView(boardId)!.lists[0].cards.map((c) => c.id)).toEqual([b, a]);
  });
});

describe("移动列", () => {
  const names = (boardId: number) => getLists(boardId).map((l) => l.name);

  it("挪到指定下标，其余列顺序不变", () => {
    const boardId = newBoard();
    const [todo, doing, done] = getLists(boardId);
    expect(names(boardId)).toEqual(["待办", "进行中", "完成"]);

    moveList(boardId, done.id, 0); // 完成挪到最前
    expect(names(boardId)).toEqual(["完成", "待办", "进行中"]);

    moveList(boardId, todo.id, 2); // 待办挪到最后（下标是在「除自己以外」那串里数的）
    expect(names(boardId)).toEqual(["完成", "进行中", "待办"]);

    moveList(boardId, doing.id, 0);
    expect(names(boardId)).toEqual(["进行中", "完成", "待办"]);
  });

  it("挪回原位是个空操作", () => {
    const boardId = newBoard();
    const [, doing] = getLists(boardId);
    moveList(boardId, doing.id, 1); // 它本来就在下标 1
    expect(names(boardId)).toEqual(["待办", "进行中", "完成"]);
  });

  it("归档的列不参与排序，也不会被挤掉", () => {
    const boardId = newBoard();
    const [todo, doing, done] = getLists(boardId);
    db().prepare("UPDATE lists SET archived_at = ? WHERE id = ?").run("2026-08-30T00:00:00Z", doing.id);

    moveList(boardId, done.id, 0);
    expect(names(boardId)).toEqual(["完成", "待办"]);
    // 归档那列还在库里，只是不出现
    expect(getLists(boardId, true).length).toBe(3);
    void todo;
  });

  it("反复往同一条缝里挪 60 次，顺序始终正确（重排会自己接上）", () => {
    const boardId = newBoard();
    const extra = Array.from({ length: 4 }, (_, i) => createList(boardId, `额外${i}`));
    const target = extra[3];

    // 每次都塞回下标 1，也就是永远挤进第一条缝
    for (let i = 0; i < 60; i++) moveList(boardId, target, 1);

    const lists = getLists(boardId);
    expect(lists[1].id).toBe(target);
    const ps = lists.map((l) => l.pos);
    for (let i = 1; i < ps.length; i++) expect(ps[i]).toBeGreaterThan(ps[i - 1]);
  });
});

describe("位次", () => {
  it("反复把卡挪进同一条缝 80 次，顺序始终正确（重排会自己接上）", () => {
    /*
     * 走 moveCard 这条真实路径（建卡永远是追加，插缝只有拖拽在干）。
     * 两张卡轮流挪到下标 1——每次都挤进头两张之间，
     * 中点几十次就会用完，之后必须靠整列重排接上，一次并列都不许出。
     */
    const boardId = newBoard();
    const [todo] = getLists(boardId);
    const a = createCard({ listId: todo.id, title: "A", createdBy: "admin" });
    const b = createCard({ listId: todo.id, title: "B", createdBy: "admin" });
    const c = createCard({ listId: todo.id, title: "C", createdBy: "admin" });

    for (let i = 0; i < 80; i++) {
      moveCard(i % 2 === 0 ? c : b, todo.id, 1, "admin");
    }

    const order = getBoardView(boardId)!.lists[0].cards;
    expect(order[0].id).toBe(a); // 头没动过
    expect(order.map((x) => x.id).sort()).toEqual([a, b, c].sort()); // 一张不丢
    const ps = order.map((x) => x.pos);
    for (let i = 1; i < ps.length; i++) expect(ps[i]).toBeGreaterThan(ps[i - 1]);
  });
});

describe("归档", () => {
  it("归档的卡不出现在板视图里，也不算在制品", () => {
    const boardId = newBoard();
    const [todo] = getLists(boardId);
    const a = createCard({ listId: todo.id, title: "A", createdBy: "admin" });
    createCard({ listId: todo.id, title: "B", createdBy: "admin" });

    archiveCard(a, true, "admin");

    const view = getBoardView(boardId)!;
    expect(view.lists[0].cards.map((c) => c.title)).toEqual(["B"]);
    expect(cardEvents(a).some((e) => e.type === "archive")).toBe(true);
  });
});

describe("可见性收口", () => {
  it("dueTodayFor 不泄露私人板的卡：派了也不推", () => {
    createUser("siyi_li", "Siyi Li", "x");
    const priv = newBoard({ visibility: "private" }); // admin 的私人板
    const open = newBoard({ name: "全组的" });
    const [pTodo] = getLists(priv);
    const [oTodo] = getLists(open);

    const secret = createCard({ listId: pTodo.id, title: "私下的事", createdBy: "admin" });
    const normal = createCard({ listId: oTodo.id, title: "公开的事", createdBy: "admin" });
    const today = "2026-09-01";
    db().prepare("UPDATE cards SET assignee_id = 'siyi_li', due_date = ? WHERE id IN (?, ?)").run(
      today, secret, normal
    );

    // siyi_li 看不见那块私人板：到期提醒只该有公开那张
    expect(dueTodayFor("siyi_li", today).map((c) => c.title)).toEqual(["公开的事"]);
    // 板主自己两张都收
    db().prepare("UPDATE cards SET assignee_id = 'admin' WHERE id IN (?, ?)").run(secret, normal);
    expect(dueTodayFor("admin", today).map((c) => c.title).sort()).toEqual([
      "公开的事",
      "私下的事",
    ]);
  });

  it("动态流只收全组板——私人板连板主自己的也不进", () => {
    const priv = newBoard({ visibility: "private" });
    const [pTodo] = getLists(priv);
    createCard({ listId: pTodo.id, title: "私下的事", createdBy: "admin" });

    const open = newBoard({ name: "全组的" });
    const [oTodo] = getLists(open);
    createCard({ listId: oTodo.id, title: "公开的事", createdBy: "admin" });

    const titles = feed("admin").map((e) => e.cardTitle);
    expect(titles).toContain("公开的事");
    expect(titles).not.toContain("私下的事");
  });

  it("assignedTo 带真实的清单进度和评论数——不是写死的 0", () => {
    const boardId = newBoard();
    const [todo] = getLists(boardId);
    const id = createCard({ listId: todo.id, title: "带附件的卡", createdBy: "admin" });
    db().prepare("UPDATE cards SET assignee_id = 'admin' WHERE id = ?").run(id);
    db().prepare("INSERT INTO check_items (card_id, text, done, pos) VALUES (?, '一', 1, 1024)").run(id);
    db().prepare("INSERT INTO check_items (card_id, text, done, pos) VALUES (?, '二', 0, 2048)").run(id);
    db().prepare(
      "INSERT INTO comments (card_id, user_id, text, created_at) VALUES (?, 'admin', '嗯', ?)"
    ).run(id, new Date().toISOString());

    const card = assignedTo("admin").find((c) => c.id === id)!;
    expect([card.checkDone, card.checkTotal, card.commentCount]).toEqual([1, 2, 1]);
    expect(card.labels).toEqual([]);
  });
});

describe("板视图", () => {
  it("批量版一次取多块板，顺序跟传入对齐，查不到的跳过", () => {
    const a = newBoard({ name: "甲" });
    const b = newBoard({ name: "乙" });
    const [aTodo] = getLists(a);
    createCard({ listId: aTodo.id, title: "甲的卡", createdBy: "admin" });

    const views = getBoardViews([b, 9999, a]);
    expect(views.map((v) => v.name)).toEqual(["乙", "甲"]);
    const va = views[1];
    expect(va.lists.map((l) => l.name)).toEqual(["待办", "进行中", "完成"]);
    expect(va.lists[0].cards.map((c) => c.title)).toEqual(["甲的卡"]);
    expect(va.labels).toHaveLength(3);
    // 乙的卡列表是空的，不会串到甲那边
    expect(views[0].lists.every((l) => l.cards.length === 0)).toBe(true);
  });


  it("卡片的标签 / 清单 / 评论数一次查完，挂在对的卡上", () => {
    const boardId = newBoard();
    const [todo] = getLists(boardId);
    const a = createCard({ listId: todo.id, title: "A", createdBy: "admin" });
    const b = createCard({ listId: todo.id, title: "B", createdBy: "admin" });
    const [urgent] = getLabels(boardId);

    const d = db();
    d.prepare("INSERT INTO card_labels (card_id, label_id) VALUES (?, ?)").run(a, urgent.id);
    d.prepare("INSERT INTO check_items (card_id, text, done, pos) VALUES (?, ?, ?, ?)").run(
      a, "第一步", 1, 1024
    );
    d.prepare("INSERT INTO check_items (card_id, text, done, pos) VALUES (?, ?, ?, ?)").run(
      a, "第二步", 0, 2048
    );
    d.prepare("INSERT INTO comments (card_id, user_id, text, created_at) VALUES (?, ?, ?, ?)").run(
      b, "admin", "问一句", new Date().toISOString()
    );

    const cards = getBoardView(boardId)!.lists[0].cards;
    const va = cards.find((c) => c.id === a)!;
    const vb = cards.find((c) => c.id === b)!;

    expect(va.labels.map((l) => l.name)).toEqual(["紧急"]);
    expect([va.checkDone, va.checkTotal]).toEqual([1, 2]);
    expect(va.commentCount).toBe(0);
    expect(vb.labels).toEqual([]);
    expect(vb.commentCount).toBe(1);
  });
});
