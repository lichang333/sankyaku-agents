/* ── 所有 SQL 都在这一层 ──
 * 页面和 Server Action 只调这里的函数，不自己拼 SQL。
 * 可见性边界也在这里：私人板对别人不存在，是由查询本身保证的，
 * 不指望每个页面都记得加那个 WHERE。
 */
import { db, q } from "./db";
import { posAtIndex, posBetween, renumber, RANK_STEP } from "./rank";
import type {
  Board,
  BoardView,
  Card,
  CardEvent,
  CardView,
  CheckItem,
  Comment,
  EventType,
  Label,
  List,
  ListView,
  User,
  Visibility,
} from "./types";
import { DEFAULT_AVATAR, type AvatarKey } from "./types";

const now = () => new Date().toISOString();

/* ══ 行 → 领域对象 ══ */

type UserRow = { id: string; display_name: string; is_admin: number };
const toUser = (r: UserRow): User => ({
  id: r.id,
  displayName: r.display_name,
  isAdmin: !!r.is_admin,
});

type BoardRow = {
  id: number;
  name: string;
  description: string | null;
  visibility: string;
  aging_days: number;
  created_by: string;
  created_at: string;
  archived_at: string | null;
};
const toBoard = (r: BoardRow): Board => ({
  id: r.id,
  name: r.name,
  description: r.description,
  visibility: r.visibility === "private" ? "private" : "group",
  agingDays: r.aging_days,
  createdBy: r.created_by,
  createdAt: r.created_at,
  archivedAt: r.archived_at,
});

type ListRow = {
  id: number;
  board_id: number;
  name: string;
  pos: number;
  wip_limit: number | null;
  is_done: number;
  archived_at: string | null;
};
const toList = (r: ListRow): List => ({
  id: r.id,
  boardId: r.board_id,
  name: r.name,
  pos: r.pos,
  wipLimit: r.wip_limit,
  isDone: !!r.is_done,
  archivedAt: r.archived_at,
});

type CardRow = {
  id: number;
  board_id: number;
  list_id: number;
  title: string;
  body: string | null;
  pos: number;
  assignee_id: string | null;
  due_date: string | null;
  created_by: string;
  created_at: string;
  entered_list_at: string;
  archived_at: string | null;
};
const toCard = (r: CardRow): Card => ({
  id: r.id,
  boardId: r.board_id,
  listId: r.list_id,
  title: r.title,
  body: r.body,
  pos: r.pos,
  assigneeId: r.assignee_id,
  dueDate: r.due_date,
  createdBy: r.created_by,
  createdAt: r.created_at,
  enteredListAt: r.entered_list_at,
  archivedAt: r.archived_at,
});

type LabelRow = { id: number; board_id: number; name: string; color: string };
const toLabel = (r: LabelRow): Label => ({
  id: r.id,
  boardId: r.board_id,
  name: r.name,
  color: r.color,
});

/* ══ 用户 / 认证 ══ */

export function getAllUsers(): User[] {
  return (
    q("SELECT id, display_name, is_admin FROM users ORDER BY created_at")
      .all() as UserRow[]
  ).map(toUser);
}

export function getUser(id: string): User | null {
  const r = q("SELECT id, display_name, is_admin FROM users WHERE id = ?")
    .get(id) as UserRow | undefined;
  return r ? toUser(r) : null;
}

export function getPasswordHash(userId: string): string | null {
  const row = q("SELECT password_hash FROM users WHERE id = ?").get(userId) as
    | { password_hash: string | null }
    | undefined;
  return row?.password_hash ?? null;
}

export function setPassword(userId: string, hash: string) {
  q("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
}

export function createUser(id: string, displayName: string, passwordHash: string) {
  q(
      "INSERT INTO users (id, display_name, password_hash, is_admin, created_at) VALUES (?, ?, ?, 0, ?)"
    )
    .run(id, displayName, passwordHash, now());
}

export function setAvatar(userId: string, avatar: AvatarKey) {
  q("UPDATE users SET avatar = ? WHERE id = ?").run(avatar, userId);
}

/** userId → 头像 key，layout 注入一次全站通用 */
export function getAvatarMap(): Record<string, string> {
  const rows = q("SELECT id, avatar FROM users").all() as {
    id: string;
    avatar: string | null;
  }[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.id] = r.avatar ?? DEFAULT_AVATAR[r.id] ?? "plain";
  return out;
}

export function createInviteCode(code: string, createdBy: string) {
  q("INSERT INTO invites (code, created_by, created_at) VALUES (?, ?, ?)")
    .run(code, createdBy, now());
}

export function getInvite(code: string) {
  return q("SELECT * FROM invites WHERE code = ?").get(code) as
    | { code: string; created_by: string; used_by: string | null }
    | undefined;
}

export function useInvite(code: string, uid: string) {
  q("UPDATE invites SET used_by = ? WHERE code = ?").run(uid, code);
}

/* ══ 板 ══ */

/**
 * 可见性条件：全组板人人可见，私人板只有主人自己看得到。
 * 这是全站唯一的隐私谓词，谁的 SQL 要用就从这里取（带表别名传进来），
 * 别再各自内联一份——访问控制的规则漂移是最伤的那种漂移。
 */
const visibleSql = (alias = "") => {
  const p = alias ? `${alias}.` : "";
  return `(${p}visibility = 'group' OR ${p}created_by = ?)`;
};

export function listBoards(userId: string, includeArchived = false): Board[] {
  const sql = `SELECT * FROM boards WHERE ${visibleSql()} ${
    includeArchived ? "" : "AND archived_at IS NULL"
  } ORDER BY archived_at IS NOT NULL, name COLLATE NOCASE`;
  return (q(sql).all(userId) as BoardRow[]).map(toBoard);
}

export function getBoard(id: number): Board | null {
  const r = q("SELECT * FROM boards WHERE id = ?").get(id) as BoardRow | undefined;
  return r ? toBoard(r) : null;
}

/** 这个人能不能看这块板。私人板只有主人能看，管理员也不行——私人就是私人。 */
export function canSeeBoard(board: Board, userId: string): boolean {
  return board.visibility === "group" || board.createdBy === userId;
}

/**
 * 新板自带三列和三个标签。空板对着一片白是最劝退的开场，
 * 而这三列（待办 / 进行中 / 完成）几乎是所有人第一步都会建的。
 * 「进行中」预设上限 3——上限的默认值必须是个具体数字，
 * 默认「不限」的话绝大多数板永远都不会去设它，看板就退化成了横过来的清单。
 */
export function createBoard(input: {
  name: string;
  description?: string | null;
  visibility?: Visibility;
  createdBy: string;
}): number {
  const d = db();
  return d.transaction(() => {
    const res = q(
        `INSERT INTO boards (name, description, visibility, aging_days, created_by, created_at)
         VALUES (?, ?, ?, 7, ?, ?)`
      )
      .run(input.name, input.description ?? null, input.visibility ?? "group", input.createdBy, now());
    const boardId = Number(res.lastInsertRowid);

    const insList = q(
      "INSERT INTO lists (board_id, name, pos, wip_limit, is_done) VALUES (?, ?, ?, ?, ?)"
    );
    insList.run(boardId, "待办", RANK_STEP, null, 0);
    insList.run(boardId, "进行中", RANK_STEP * 2, 3, 0);
    insList.run(boardId, "完成", RANK_STEP * 3, null, 1);

    const insLabel = q("INSERT INTO labels (board_id, name, color) VALUES (?, ?, ?)");
    insLabel.run(boardId, "紧急", "cardinal");
    insLabel.run(boardId, "等别人", "bee");
    insLabel.run(boardId, "小事", "hare");

    return boardId;
  })();
}

export function updateBoard(
  id: number,
  patch: { name?: string; description?: string | null; visibility?: Visibility; agingDays?: number }
) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.name !== undefined) (sets.push("name = ?"), vals.push(patch.name));
  if (patch.description !== undefined) (sets.push("description = ?"), vals.push(patch.description));
  if (patch.visibility !== undefined) (sets.push("visibility = ?"), vals.push(patch.visibility));
  if (patch.agingDays !== undefined) (sets.push("aging_days = ?"), vals.push(patch.agingDays));
  if (!sets.length) return;
  q(`UPDATE boards SET ${sets.join(", ")} WHERE id = ?`)
    .run(...vals, id);
}

export function archiveBoard(id: number, on: boolean) {
  q("UPDATE boards SET archived_at = ? WHERE id = ?").run(on ? now() : null, id);
}

/** 真删。级联把列、卡、评论、履历一起带走。只有管理员走得到这里。 */
export function deleteBoard(id: number) {
  q("DELETE FROM boards WHERE id = ?").run(id);
}

/**
 * 一批板的完整视图，固定 6 条 IN 查询，与板数、卡数都无关。
 * 首页要同时算每块板的红线，逐板各查一轮就是 6×N——
 * 这里把同样的语句换成 WHERE board_id IN (...) 一轮跑完，
 * 规则照旧交给 lib/board.ts 的纯函数，「只定义一处」的前提不破。
 * 返回顺序跟传入的 boardIds 对齐，查不到的板跳过。
 */
export function getBoardViews(boardIds: number[]): BoardView[] {
  if (!boardIds.length) return [];
  const qs = boardIds.map(() => "?").join(",");

  const boards = (
    q(`SELECT * FROM boards WHERE id IN (${qs})`).all(...boardIds) as BoardRow[]
  ).map(toBoard);

  const lists = (
    q(
        `SELECT * FROM lists WHERE board_id IN (${qs}) AND archived_at IS NULL ORDER BY pos`
      )
      .all(...boardIds) as ListRow[]
  ).map(toList);

  const cards = (
    q(
        `SELECT * FROM cards WHERE board_id IN (${qs}) AND archived_at IS NULL ORDER BY pos`
      )
      .all(...boardIds) as CardRow[]
  ).map(toCard);

  const labels = (
    q(`SELECT * FROM labels WHERE board_id IN (${qs}) ORDER BY id`).all(...boardIds) as LabelRow[]
  ).map(toLabel);
  const labelById = new Map(labels.map((l) => [l.id, l]));

  const links = q(
      `SELECT cl.card_id, cl.label_id FROM card_labels cl
       JOIN cards c ON c.id = cl.card_id WHERE c.board_id IN (${qs})`
    )
    .all(...boardIds) as { card_id: number; label_id: number }[];
  const labelsOf = new Map<number, Label[]>();
  for (const link of links) {
    const label = labelById.get(link.label_id);
    if (!label) continue;
    const arr = labelsOf.get(link.card_id);
    if (arr) arr.push(label);
    else labelsOf.set(link.card_id, [label]);
  }

  const checks = q(
      `SELECT ci.card_id, SUM(ci.done) AS done, COUNT(*) AS total FROM check_items ci
       JOIN cards c ON c.id = ci.card_id WHERE c.board_id IN (${qs}) GROUP BY ci.card_id`
    )
    .all(...boardIds) as { card_id: number; done: number; total: number }[];
  const checkOf = new Map(checks.map((c) => [c.card_id, c]));

  const comments = q(
      `SELECT cm.card_id, COUNT(*) AS n FROM comments cm
       JOIN cards c ON c.id = cm.card_id WHERE c.board_id IN (${qs}) GROUP BY cm.card_id`
    )
    .all(...boardIds) as { card_id: number; n: number }[];
  const commentOf = new Map(comments.map((c) => [c.card_id, c.n]));

  const toView = (c: Card): CardView => ({
    ...c,
    labels: labelsOf.get(c.id) ?? [],
    checkDone: checkOf.get(c.id)?.done ?? 0,
    checkTotal: checkOf.get(c.id)?.total ?? 0,
    commentCount: commentOf.get(c.id) ?? 0,
  });

  const byList = new Map<number, CardView[]>(lists.map((l) => [l.id, []]));
  for (const c of cards) byList.get(c.listId)?.push(toView(c));

  const byBoard = new Map(boards.map((b) => [b.id, b]));
  const out: BoardView[] = [];
  for (const id of boardIds) {
    const board = byBoard.get(id);
    if (!board) continue;
    out.push({
      ...board,
      lists: lists.filter((l) => l.boardId === id).map((l) => ({ ...l, cards: byList.get(l.id) ?? [] })),
      labels: labels.filter((l) => l.boardId === id),
    });
  }
  return out;
}

/** 单板视图：批量版取一块。 */
export function getBoardView(boardId: number): BoardView | null {
  return getBoardViews([boardId])[0] ?? null;
}

/* ══ 列 ══ */

export function getLists(boardId: number, includeArchived = false): List[] {
  const sql = `SELECT * FROM lists WHERE board_id = ? ${
    includeArchived ? "" : "AND archived_at IS NULL"
  } ORDER BY pos`;
  return (q(sql).all(boardId) as ListRow[]).map(toList);
}

export function getList(id: number): List | null {
  const r = q("SELECT * FROM lists WHERE id = ?").get(id) as ListRow | undefined;
  return r ? toList(r) : null;
}

export function createList(boardId: number, name: string): number {
  const last = q("SELECT MAX(pos) AS m FROM lists WHERE board_id = ?")
    .get(boardId) as { m: number | null };
  const pos = (last.m ?? 0) + RANK_STEP;
  const res = q("INSERT INTO lists (board_id, name, pos) VALUES (?, ?, ?)")
    .run(boardId, name, pos);
  return Number(res.lastInsertRowid);
}

export function updateList(
  id: number,
  patch: { name?: string; wipLimit?: number | null; isDone?: boolean }
) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.name !== undefined) (sets.push("name = ?"), vals.push(patch.name));
  if (patch.wipLimit !== undefined) (sets.push("wip_limit = ?"), vals.push(patch.wipLimit));
  if (patch.isDone !== undefined) (sets.push("is_done = ?"), vals.push(patch.isDone ? 1 : 0));
  if (!sets.length) return;
  q(`UPDATE lists SET ${sets.join(", ")} WHERE id = ?`)
    .run(...vals, id);
}

/** 把列挪到第 index 位。缝隙不够就先把整排重排一遍再插。 */
export function moveList(boardId: number, listId: number, index: number) {
  const d = db();
  d.transaction(() => {
    const others = (
      q(
          "SELECT * FROM lists WHERE board_id = ? AND archived_at IS NULL AND id != ? ORDER BY pos"
        )
        .all(boardId, listId) as ListRow[]
    ).map(toList);

    let pos = posAtIndex(others.map((l) => l.pos), index);
    if (pos == null) {
      const fresh = renumber(others.length);
      const upd = q("UPDATE lists SET pos = ? WHERE id = ?");
      others.forEach((l, i) => upd.run(fresh[i], l.id));
      pos = posAtIndex(fresh, index)!;
    }
    q("UPDATE lists SET pos = ? WHERE id = ?").run(pos, listId);
  })();
}

export function archiveList(id: number, on: boolean) {
  q("UPDATE lists SET archived_at = ? WHERE id = ?").run(on ? now() : null, id);
}

export function deleteList(id: number) {
  q("DELETE FROM lists WHERE id = ?").run(id);
}

/* ══ 卡片 ══ */

export function getCard(id: number): Card | null {
  const r = q("SELECT * FROM cards WHERE id = ?").get(id) as CardRow | undefined;
  return r ? toCard(r) : null;
}

export function createCard(input: { listId: number; title: string; createdBy: string }): number {
  const d = db();
  return d.transaction(() => {
    const list = getList(input.listId);
    if (!list) throw new Error("列不存在");
    // 新卡永远追加到列尾（和 createList 同款）。「插到第几位」的活只有拖拽在干，
    // 那是 moveCard 的事——这里不留一条没人走的插入路径
    const last = q("SELECT MAX(pos) AS m FROM cards WHERE list_id = ?")
      .get(input.listId) as { m: number | null };
    const pos = (last.m ?? 0) + RANK_STEP;

    const t = now();
    const res = q(
        `INSERT INTO cards (board_id, list_id, title, pos, created_by, created_at, entered_list_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(list.boardId, input.listId, input.title, pos, input.createdBy, t, t);
    const cardId = Number(res.lastInsertRowid);
    addEvent({
      cardId,
      boardId: list.boardId,
      userId: input.createdBy,
      type: "create",
      toList: list.name,
    });
    return cardId;
  })();
}

/**
 * 移动一张卡：到 listId 的第 index 位。
 *
 * 只有真的换了列才重置 `entered_list_at`——列内上下调整顺序不该让卡龄归零，
 * 否则「把卡拖到列首以示重要」这个再自然不过的动作会把停滞记录抹掉，
 * 而停滞记录正是看板要盯的东西。
 */
export function moveCard(cardId: number, listId: number, index: number, userId: string) {
  const d = db();
  d.transaction(() => {
    const card = getCard(cardId);
    const to = getList(listId);
    if (!card || !to) return;
    const from = getList(card.listId);

    const positions = (
      q(
          "SELECT pos FROM cards WHERE list_id = ? AND archived_at IS NULL AND id != ? ORDER BY pos"
        )
        .all(listId, cardId) as { pos: number }[]
    ).map((r) => r.pos);

    let pos = posAtIndex(positions, index);
    if (pos == null) {
      // 缝隙用完了：把目标列（除自己外）重排，再取一次
      const rows = q(
          "SELECT id FROM cards WHERE list_id = ? AND archived_at IS NULL AND id != ? ORDER BY pos"
        )
        .all(listId, cardId) as { id: number }[];
      const fresh = renumber(rows.length);
      const upd = q("UPDATE cards SET pos = ? WHERE id = ?");
      rows.forEach((r, i) => upd.run(fresh[i], r.id));
      pos = posAtIndex(fresh, index)!;
    }

    const changedList = card.listId !== listId;
    q(
      `UPDATE cards SET list_id = ?, board_id = ?, pos = ?${
        changedList ? ", entered_list_at = ?" : ""
      } WHERE id = ?`
    ).run(
      ...(changedList
        ? [listId, to.boardId, pos, now(), cardId]
        : [listId, to.boardId, pos, cardId])
    );

    if (changedList) {
      addEvent({
        cardId,
        boardId: to.boardId,
        userId,
        type: "move",
        fromList: from?.name ?? null,
        toList: to.name,
      });
    }
  })();
}

export function updateCard(
  id: number,
  patch: {
    title?: string;
    body?: string | null;
    assigneeId?: string | null;
    dueDate?: string | null;
  }
) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.title !== undefined) (sets.push("title = ?"), vals.push(patch.title));
  if (patch.body !== undefined) (sets.push("body = ?"), vals.push(patch.body));
  if (patch.assigneeId !== undefined) (sets.push("assignee_id = ?"), vals.push(patch.assigneeId));
  if (patch.dueDate !== undefined) (sets.push("due_date = ?"), vals.push(patch.dueDate));
  if (!sets.length) return;
  q(`UPDATE cards SET ${sets.join(", ")} WHERE id = ?`)
    .run(...vals, id);
}

export function archiveCard(id: number, on: boolean, userId: string) {
  const card = getCard(id);
  if (!card) return;
  q("UPDATE cards SET archived_at = ? WHERE id = ?").run(on ? now() : null, id);
  addEvent({
    cardId: id,
    boardId: card.boardId,
    userId,
    type: on ? "archive" : "restore",
  });
}

export function deleteCard(id: number) {
  q("DELETE FROM cards WHERE id = ?").run(id);
}

/** 板上的归档卡，最近归档的在前 */
export function archivedCards(boardId: number, limit = 100): Card[] {
  return (
    q(
        "SELECT * FROM cards WHERE board_id = ? AND archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT ?"
      )
      .all(boardId, limit) as CardRow[]
  ).map(toCard);
}

export interface AssignedCard extends CardView {
  boardName: string;
  listName: string;
  listIsDone: boolean;
  agingDays: number;
}

/**
 * 指派给某人的所有活着的卡（跨板，只含他看得见的板）。
 * 排序交给调用方的纯函数（`compareUrgency`）——紧迫度的定义只该写一遍。
 */
export function assignedTo(userId: string, viewerId = userId): AssignedCard[] {
  const rows = q(
      `SELECT c.*, b.name AS board_name, b.aging_days, l.name AS list_name, l.is_done
       FROM cards c
       JOIN boards b ON b.id = c.board_id
       JOIN lists l ON l.id = c.list_id
       WHERE c.assignee_id = ? AND c.archived_at IS NULL
         AND l.archived_at IS NULL AND b.archived_at IS NULL
         AND ${visibleSql("b")}`
    )
    .all(userId, viewerId) as (CardRow & {
    board_name: string;
    aging_days: number;
    list_name: string;
    is_done: number;
  })[];

  if (!rows.length) return [];

  /*
   * 标签 / 清单进度 / 评论数各用一条 IN 查询批量取，
   * 不在 map 里逐卡查——那是 N+1，而首页和「我的」每次请求都要走这条路。
   * 之前这里干脆把三个数写死成 0，结果同一张卡在板上有 ☑ 2/5 徽标、
   * 在「我的」里却什么都不显示，像是清单被清空了。
   */
  const ids = rows.map((r) => r.id);
  const qs = ids.map(() => "?").join(",");
  const d = db();

  const labelRows = q(
      `SELECT cl.card_id, l.* FROM card_labels cl
       JOIN labels l ON l.id = cl.label_id WHERE cl.card_id IN (${qs}) ORDER BY l.id`
    )
    .all(...ids) as (LabelRow & { card_id: number })[];
  const labelsOf = new Map<number, Label[]>();
  for (const r of labelRows) {
    const arr = labelsOf.get(r.card_id);
    if (arr) arr.push(toLabel(r));
    else labelsOf.set(r.card_id, [toLabel(r)]);
  }

  const checkRows = q(
      `SELECT card_id, SUM(done) AS done, COUNT(*) AS total FROM check_items
       WHERE card_id IN (${qs}) GROUP BY card_id`
    )
    .all(...ids) as { card_id: number; done: number; total: number }[];
  const checkOf = new Map(checkRows.map((r) => [r.card_id, r]));

  const commentRows = q(`SELECT card_id, COUNT(*) AS n FROM comments WHERE card_id IN (${qs}) GROUP BY card_id`)
    .all(...ids) as { card_id: number; n: number }[];
  const commentOf = new Map(commentRows.map((r) => [r.card_id, r.n]));

  return rows.map((r) => ({
    ...toCard(r),
    labels: labelsOf.get(r.id) ?? [],
    checkDone: checkOf.get(r.id)?.done ?? 0,
    checkTotal: checkOf.get(r.id)?.total ?? 0,
    commentCount: commentOf.get(r.id) ?? 0,
    boardName: r.board_name,
    listName: r.list_name,
    listIsDone: !!r.is_done,
    agingDays: r.aging_days,
  }));
}

/* ══ 标签 ══ */

export function getLabels(boardId: number): Label[] {
  return (
    q("SELECT * FROM labels WHERE board_id = ? ORDER BY id").all(boardId) as LabelRow[]
  ).map(toLabel);
}

export function getLabel(id: number): Label | null {
  const r = q("SELECT * FROM labels WHERE id = ?").get(id) as LabelRow | undefined;
  return r ? toLabel(r) : null;
}

export function cardLabels(cardId: number): Label[] {
  return (
    q(
        "SELECT l.* FROM labels l JOIN card_labels cl ON cl.label_id = l.id WHERE cl.card_id = ? ORDER BY l.id"
      )
      .all(cardId) as LabelRow[]
  ).map(toLabel);
}

export function createLabel(boardId: number, name: string, color: string): number {
  const res = q("INSERT INTO labels (board_id, name, color) VALUES (?, ?, ?)")
    .run(boardId, name, color);
  return Number(res.lastInsertRowid);
}

export function updateLabel(id: number, patch: { name?: string; color?: string }) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.name !== undefined) (sets.push("name = ?"), vals.push(patch.name));
  if (patch.color !== undefined) (sets.push("color = ?"), vals.push(patch.color));
  if (!sets.length) return;
  q(`UPDATE labels SET ${sets.join(", ")} WHERE id = ?`)
    .run(...vals, id);
}

export function deleteLabel(id: number) {
  q("DELETE FROM labels WHERE id = ?").run(id);
}

export function setCardLabel(cardId: number, labelId: number, on: boolean) {
  if (on) {
    q("INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)")
      .run(cardId, labelId);
  } else {
    q("DELETE FROM card_labels WHERE card_id = ? AND label_id = ?")
      .run(cardId, labelId);
  }
}

/* ══ 小清单 ══ */

export function getCheckItems(cardId: number): CheckItem[] {
  return (
    q("SELECT * FROM check_items WHERE card_id = ? ORDER BY pos")
      .all(cardId) as { id: number; card_id: number; text: string; done: number; pos: number }[]
  ).map((r) => ({ id: r.id, cardId: r.card_id, text: r.text, done: !!r.done, pos: r.pos }));
}

export function addCheckItem(cardId: number, text: string): number {
  const last = q("SELECT MAX(pos) AS m FROM check_items WHERE card_id = ?")
    .get(cardId) as { m: number | null };
  const res = q("INSERT INTO check_items (card_id, text, pos) VALUES (?, ?, ?)")
    .run(cardId, text, (last.m ?? 0) + RANK_STEP);
  return Number(res.lastInsertRowid);
}

/** 守卫用：这条清单项属于哪张卡。查不到返回 null。 */
export function checkItemCardId(id: number): number | null {
  const r = q("SELECT card_id FROM check_items WHERE id = ?").get(id) as
    | { card_id: number }
    | undefined;
  return r?.card_id ?? null;
}

export function toggleCheckItem(id: number, done: boolean) {
  q("UPDATE check_items SET done = ? WHERE id = ?").run(done ? 1 : 0, id);
}

export function deleteCheckItem(id: number) {
  q("DELETE FROM check_items WHERE id = ?").run(id);
}

/* ══ 评论 ══ */

export function getComments(cardId: number): Comment[] {
  return (
    q("SELECT * FROM comments WHERE card_id = ? ORDER BY created_at")
      .all(cardId) as { id: number; card_id: number; user_id: string; text: string; created_at: string }[]
  ).map((r) => ({
    id: r.id,
    cardId: r.card_id,
    userId: r.user_id,
    text: r.text,
    createdAt: r.created_at,
  }));
}

export function addComment(cardId: number, userId: string, text: string): number {
  const card = getCard(cardId);
  const res = q("INSERT INTO comments (card_id, user_id, text, created_at) VALUES (?, ?, ?, ?)")
    .run(cardId, userId, text, now());
  if (card) {
    addEvent({ cardId, boardId: card.boardId, userId, type: "comment", text: text.slice(0, 80) });
  }
  return Number(res.lastInsertRowid);
}

/** 守卫用：这条评论属于哪张卡、是谁写的。 */
export function getCommentMeta(id: number): { cardId: number; userId: string } | null {
  const r = q("SELECT card_id, user_id FROM comments WHERE id = ?").get(id) as
    | { card_id: number; user_id: string }
    | undefined;
  return r ? { cardId: r.card_id, userId: r.user_id } : null;
}

export function deleteComment(id: number) {
  q("DELETE FROM comments WHERE id = ?").run(id);
}

/* ══ 履历 / 动态 ══ */

type EventRow = {
  id: number;
  card_id: number;
  board_id: number;
  user_id: string;
  type: string;
  from_list: string | null;
  to_list: string | null;
  text: string | null;
  created_at: string;
};
const toEvent = (r: EventRow): CardEvent => ({
  id: r.id,
  cardId: r.card_id,
  boardId: r.board_id,
  userId: r.user_id,
  type: r.type as EventType,
  fromList: r.from_list,
  toList: r.to_list,
  text: r.text,
  createdAt: r.created_at,
});

export function addEvent(e: {
  cardId: number;
  boardId: number;
  userId: string;
  type: EventType;
  fromList?: string | null;
  toList?: string | null;
  text?: string | null;
}) {
  q(
      `INSERT INTO card_events (card_id, board_id, user_id, type, from_list, to_list, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      e.cardId,
      e.boardId,
      e.userId,
      e.type,
      e.fromList ?? null,
      e.toList ?? null,
      e.text ?? null,
      now()
    );
}

export function cardEvents(cardId: number, limit = 50): CardEvent[] {
  return (
    q("SELECT * FROM card_events WHERE card_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(cardId, limit) as EventRow[]
  ).map(toEvent);
}

export interface FeedItem extends CardEvent {
  cardTitle: string;
  boardName: string;
}

/**
 * 全站动态。只收全组板——私人板不进动态流，连板主自己的也不进：
 * 动态页的文案就是这么承诺的，这里必须兑现。
 * 自己私人板上的事自己在板上看，不需要动态流复述一遍。
 */
export function feed(_viewerId: string, limit = 60): FeedItem[] {
  const rows = q(
      `SELECT e.*, c.title AS card_title, b.name AS board_name
       FROM card_events e
       JOIN cards c ON c.id = e.card_id
       JOIN boards b ON b.id = e.board_id
       WHERE b.visibility = 'group'
       ORDER BY e.created_at DESC LIMIT ?`
    )
    .all(limit) as (EventRow & { card_title: string; board_name: string })[];
  return rows.map((r) => ({ ...toEvent(r), cardTitle: r.card_title, boardName: r.board_name }));
}

/* ══ 推送订阅 ══ */

export function savePushSub(s: { endpoint: string; user_id: string; p256dh: string; auth: string }) {
  q(
      `INSERT INTO push_subs (endpoint, user_id, p256dh, auth, created_at)
       VALUES (@endpoint, @user_id, @p256dh, @auth, @created_at)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = @user_id, p256dh = @p256dh, auth = @auth`
    )
    .run({ ...s, created_at: now() });
}

export function deletePushSub(endpoint: string) {
  q("DELETE FROM push_subs WHERE endpoint = ?").run(endpoint);
}

export function pushSubsFor(userIds: string[]) {
  if (!userIds.length) return [];
  const qs = userIds.map(() => "?").join(",");
  return q(`SELECT * FROM push_subs WHERE user_id IN (${qs})`)
    .all(...userIds) as { endpoint: string; user_id: string; p256dh: string; auth: string }[];
}

/** 每天早上的到期提醒用：某人今天到期、且还没进完成列的卡 */
export function dueTodayFor(userId: string, today: string): { id: number; title: string }[] {
  return q(
      `SELECT c.id, c.title FROM cards c
       JOIN lists l ON l.id = c.list_id
       JOIN boards b ON b.id = c.board_id
       WHERE c.assignee_id = ? AND c.due_date = ? AND c.archived_at IS NULL
         AND l.is_done = 0 AND l.archived_at IS NULL AND b.archived_at IS NULL
         -- 与 assignedTo 同一条可见性规则：看不见的板上的卡不推送，
         -- 否则私人板的卡片标题会通过通知漏出去，点进去还什么都看不到
         AND (b.visibility = 'group' OR b.created_by = ?)`
    )
    .all(userId, today, userId) as { id: number; title: string }[];
}

