"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, hashPassword, verifyPassword } from "@/lib/auth";
import { requireUser, SESSION_COOKIE } from "@/lib/current-user";
import { pushTo } from "@/lib/notify";
import {
  addCheckItem,
  addComment,
  addEvent,
  archiveBoard,
  archiveCard,
  archiveList,
  canSeeBoard,
  checkItemCardId,
  createBoard,
  createInviteCode,
  createLabel,
  createList,
  createCard,
  createUser,
  deleteBoard,
  deleteCard,
  deleteCheckItem,
  deleteComment,
  deleteLabel,
  deleteList,
  getBoard,
  getCard,
  getCommentMeta,
  getInvite,
  getLabel,
  getList,
  getPasswordHash,
  getUser,
  moveCard,
  moveList,
  setAvatar as saveAvatar,
  setCardLabel,
  setPassword,
  toggleCheckItem,
  updateBoard,
  updateCard,
  updateLabel,
  updateList,
  useInvite,
} from "@/lib/queries";
import { AVATARS, isValidLabelColor, type Visibility } from "@/lib/types";
import type { User } from "@/lib/types";

/* ══ 认证 ══ */

export async function login(uid: string, password: string) {
  const user = getUser(uid);
  if (!user) return { error: "没有这个账号" };
  const stored = getPasswordHash(uid);
  // 不做「首登即设密码」：重建数据库后会留下抢注窗口。
  // 种子账号的初始密码用 scripts/set-password.ts 在服务器上预设。
  if (!stored)
    return { error: "该账号还未设置初始密码（管理员用 scripts/set-password.ts 设置）" };
  if (!verifyPassword(password, stored)) return { error: "密码不对" };

  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(uid), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 180 * 86400,
    path: "/",
  });
  redirect("/");
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function changePassword(oldPw: string, newPw: string) {
  const user = await requireUser();
  const stored = getPasswordHash(user.id);
  // 与登录同口径：空哈希不等于免验证
  if (!stored) return { error: "账号还未设置初始密码（管理员用 scripts/set-password.ts 设置）" };
  if (!verifyPassword(oldPw, stored)) return { error: "当前密码不对" };
  if (newPw.length < 6) return { error: "新密码至少 6 位" };
  setPassword(user.id, hashPassword(newPw));
  return { ok: true } as { ok?: boolean; error?: string };
}

export async function createInvite(): Promise<{ code: string }> {
  const user = await requireUser();
  const code = randomBytes(4).toString("hex");
  createInviteCode(code, user.id);
  return { code };
}

export async function registerWithInvite(form: {
  code: string;
  uid: string;
  displayName: string;
  password: string;
}) {
  const code = form.code.trim();
  const uid = form.uid.trim().toLowerCase();
  const displayName = form.displayName.trim();
  if (!/^[a-z0-9_]{2,24}$/.test(uid))
    return { error: "账号只能用小写字母 / 数字 / 下划线（2–24 位）" };
  if (!displayName) return { error: "填个显示名吧" };
  if (form.password.length < 6) return { error: "密码至少 6 位" };
  const invite = getInvite(code);
  if (!invite) return { error: "邀请码不存在" };
  if (invite.used_by) return { error: "这个邀请码已经被用过了" };
  if (getUser(uid)) return { error: "这个账号已存在" };

  createUser(uid, displayName, hashPassword(form.password));
  useInvite(code, uid);

  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(uid), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 180 * 86400,
    path: "/",
  });
  redirect("/");
}

export async function setAvatar(key: string) {
  const user = await requireUser();
  if (!AVATARS.some((a) => a.key === key)) return { error: "没有这个头像" };
  saveAvatar(user.id, key as (typeof AVATARS)[number]["key"]);
  revalidatePath("/", "layout");
  return {} as { error?: string };
}

/* ══ 权限 ══
 * 每个写操作都要自己确认「这个人碰得到这块板」。
 * 不做成中间件：Server Action 是直接可达的入口，
 * 从界面上摸不到的按钮不等于从网络上调不到那个函数。
 */

async function boardGuard(boardId: number): Promise<{ user: User; ok: boolean }> {
  const user = await requireUser();
  const board = getBoard(boardId);
  return { user, ok: !!board && canSeeBoard(board, user.id) };
}

async function cardGuard(cardId: number) {
  const card = getCard(cardId);
  if (!card) return { user: await requireUser(), card: null, ok: false as const };
  const { user, ok } = await boardGuard(card.boardId);
  return { user, card, ok };
}

/* ══ 板 ══ */

export async function createBoardAction(form: {
  name: string;
  description?: string;
  visibility?: Visibility;
}) {
  const user = await requireUser();
  const name = form.name.trim();
  if (!name) return { error: "给板起个名字" };
  const id = createBoard({
    name,
    description: form.description?.trim() || null,
    visibility: form.visibility === "private" ? "private" : "group",
    createdBy: user.id,
  });
  revalidatePath("/");
  redirect(`/b/${id}`);
}

export async function updateBoardAction(
  boardId: number,
  patch: { name?: string; description?: string | null; visibility?: Visibility; agingDays?: number }
) {
  const { user, ok } = await boardGuard(boardId);
  const board = getBoard(boardId);
  if (!ok || !board) return { error: "找不到这块板" };
  // 板的设置只有建它的人和管理员能改
  if (board.createdBy !== user.id && !user.isAdmin) return { error: "只有建板的人能改设置" };
  if (patch.name !== undefined && !patch.name.trim()) return { error: "名字不能空着" };
  if (patch.agingDays !== undefined && (patch.agingDays < 1 || patch.agingDays > 90))
    return { error: "卡龄天数请填 1–90" };
  updateBoard(boardId, patch);
  revalidatePath(`/b/${boardId}`);
  revalidatePath("/");
  return {};
}

export async function archiveBoardAction(boardId: number, on: boolean) {
  const { user, ok } = await boardGuard(boardId);
  const board = getBoard(boardId);
  if (!ok || !board) return { error: "找不到这块板" };
  if (board.createdBy !== user.id && !user.isAdmin) return { error: "只有建板的人能归档" };
  archiveBoard(boardId, on);
  revalidatePath("/");
  return {};
}

/** 真删，级联带走列 / 卡 / 评论 / 履历。只有管理员能走到这一步。 */
export async function deleteBoardAction(boardId: number) {
  const user = await requireUser();
  if (!user.isAdmin) return { error: "只有管理员能删板" };
  deleteBoard(boardId);
  revalidatePath("/");
  redirect("/");
}

/* ══ 列 ══ */

export async function createListAction(boardId: number, name: string) {
  const { ok } = await boardGuard(boardId);
  if (!ok) return { error: "找不到这块板" };
  if (!name.trim()) return { error: "列名不能空着" };
  createList(boardId, name.trim());
  revalidatePath(`/b/${boardId}`);
  return {};
}

export async function updateListAction(
  listId: number,
  patch: { name?: string; wipLimit?: number | null; isDone?: boolean }
) {
  const list = getList(listId);
  if (!list) return { error: "找不到这一列" };
  const { ok } = await boardGuard(list.boardId);
  if (!ok) return { error: "找不到这块板" };
  if (patch.name !== undefined && !patch.name.trim()) return { error: "列名不能空着" };
  if (patch.wipLimit != null && (patch.wipLimit < 1 || patch.wipLimit > 99))
    return { error: "在制品上限请填 1–99" };
  updateList(listId, patch);
  revalidatePath(`/b/${list.boardId}`);
  return {};
}

export async function moveListAction(listId: number, index: number) {
  const list = getList(listId);
  if (!list) return { error: "找不到这一列" };
  const { ok } = await boardGuard(list.boardId);
  if (!ok) return { error: "找不到这块板" };
  moveList(list.boardId, listId, index);
  revalidatePath(`/b/${list.boardId}`);
  return {};
}

export async function archiveListAction(listId: number, on: boolean) {
  const list = getList(listId);
  if (!list) return { error: "找不到这一列" };
  const { ok } = await boardGuard(list.boardId);
  if (!ok) return { error: "找不到这块板" };
  archiveList(listId, on);
  revalidatePath(`/b/${list.boardId}`);
  return {};
}

export async function deleteListAction(listId: number) {
  const list = getList(listId);
  if (!list) return { error: "找不到这一列" };
  // 先过可见性，再谈权限：私人就是私人，管理员也不例外（与 archiveBoard/deleteCard 同口径）
  const { user, ok } = await boardGuard(list.boardId);
  if (!ok) return { error: "找不到这一列" };
  if (!user.isAdmin) return { error: "只有管理员能真删列（其他人请用归档）" };
  deleteList(listId);
  revalidatePath(`/b/${list.boardId}`);
  return {};
}

/* ══ 卡片 ══ */

export async function createCardAction(listId: number, title: string) {
  const list = getList(listId);
  if (!list) return { error: "找不到这一列" };
  const { user, ok } = await boardGuard(list.boardId);
  if (!ok) return { error: "找不到这块板" };
  const t = title.trim();
  if (!t) return { error: "卡片得有个标题" };
  const id = createCard({ listId, title: t, createdBy: user.id });
  revalidatePath(`/b/${list.boardId}`);
  return { id };
}

/**
 * 拖拽落点。界面已经先乐观地把卡挪过去了，这里做的是把它坐实；
 * 失败时返回 error，前端据此回滚并重新拉一次板。
 */
export async function moveCardAction(cardId: number, listId: number, index: number) {
  const { user, card, ok } = await cardGuard(cardId);
  if (!ok || !card) return { error: "找不到这张卡" };
  const to = getList(listId);
  // 不许跨板拖：两块板的列不会同时出现在一个屏幕上，
  // 真发生了那是请求被改过，不是用户手滑
  if (!to || to.boardId !== card.boardId) return { error: "目标列不在这块板上" };
  moveCard(cardId, listId, index, user.id);
  revalidatePath(`/b/${card.boardId}`);
  return {};
}

export async function updateCardAction(
  cardId: number,
  patch: { title?: string; body?: string | null; assigneeId?: string | null; dueDate?: string | null }
) {
  const { user, card, ok } = await cardGuard(cardId);
  if (!ok || !card) return { error: "找不到这张卡" };
  if (patch.title !== undefined && !patch.title.trim()) return { error: "标题不能空着" };
  if (patch.dueDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate)) return { error: "日期格式不对" };
  }
  if (patch.assigneeId && !getUser(patch.assigneeId)) return { error: "没有这个人" };

  updateCard(cardId, patch);

  if (patch.title !== undefined && patch.title.trim() !== card.title) {
    addEvent({ cardId, boardId: card.boardId, userId: user.id, type: "rename", text: patch.title.trim() });
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== card.assigneeId) {
    const who = patch.assigneeId ? getUser(patch.assigneeId) : null;
    addEvent({
      cardId,
      boardId: card.boardId,
      userId: user.id,
      type: "assign",
      text: who?.displayName ?? null,
    });
    // 只在指派给别人时推——自己给自己派活不需要手机响一声
    if (patch.assigneeId && patch.assigneeId !== user.id) {
      await pushTo([patch.assigneeId], {
        title: "有张卡派给你了",
        body: `${user.displayName}：${card.title}`,
        url: `/c/${cardId}`,
        tag: `card-${cardId}`,
      });
    }
  }
  if (patch.dueDate !== undefined && patch.dueDate !== card.dueDate) {
    addEvent({ cardId, boardId: card.boardId, userId: user.id, type: "due", text: patch.dueDate });
  }

  revalidatePath(`/c/${cardId}`);
  revalidatePath(`/b/${card.boardId}`);
  return {};
}

export async function archiveCardAction(cardId: number, on: boolean) {
  const { user, card, ok } = await cardGuard(cardId);
  if (!ok || !card) return { error: "找不到这张卡" };
  archiveCard(cardId, on, user.id);
  revalidatePath(`/b/${card.boardId}`);
  revalidatePath(`/c/${cardId}`);
  return {};
}

export async function deleteCardAction(cardId: number) {
  const { user, card, ok } = await cardGuard(cardId);
  if (!ok || !card) return { error: "找不到这张卡" };
  if (!user.isAdmin && card.createdBy !== user.id)
    return { error: "只有建卡的人和管理员能真删（其他人请用归档）" };
  const boardId = card.boardId;
  deleteCard(cardId);
  revalidatePath(`/b/${boardId}`);
  redirect(`/b/${boardId}`);
}

/* ══ 标签 ══ */

export async function toggleCardLabelAction(cardId: number, labelId: number, on: boolean) {
  const { card, ok } = await cardGuard(cardId);
  if (!ok || !card) return { error: "找不到这张卡" };
  // 标签必须来自这张卡所在的板。不查的话，可以拿自己的卡当跳板，
  // 把别人私人板的标签挂过来——标签名就这么漏出去了
  const label = getLabel(labelId);
  if (!label || label.boardId !== card.boardId) return { error: "没有这个标签" };
  setCardLabel(cardId, labelId, on);
  revalidatePath(`/c/${cardId}`);
  revalidatePath(`/b/${card.boardId}`);
  return {};
}

export async function createLabelAction(boardId: number, name: string, color: string) {
  const { ok } = await boardGuard(boardId);
  if (!ok) return { error: "找不到这块板" };
  if (!name.trim()) return { error: "标签得有个名字" };
  if (!isValidLabelColor(color)) return { error: "没有这个颜色" };
  createLabel(boardId, name.trim(), color);
  revalidatePath(`/b/${boardId}`);
  return {};
}

export async function updateLabelAction(
  boardId: number,
  labelId: number,
  patch: { name?: string; color?: string }
) {
  // 守卫按标签实际所属的板来做——boardId 是客户端说的，只用来交叉校验。
  // 信它的话，拿一块自己能看的板当通行证就能改任何板的标签。
  const label = getLabel(labelId);
  if (!label || label.boardId !== boardId) return { error: "没有这个标签" };
  const { ok } = await boardGuard(label.boardId);
  if (!ok) return { error: "找不到这块板" };
  if (patch.name !== undefined && !patch.name.trim()) return { error: "标签得有个名字" };
  if (patch.color && !isValidLabelColor(patch.color)) return { error: "没有这个颜色" };
  updateLabel(labelId, { name: patch.name?.trim(), color: patch.color });
  revalidatePath(`/b/${boardId}`);
  return {};
}

export async function deleteLabelAction(boardId: number, labelId: number) {
  const label = getLabel(labelId);
  if (!label || label.boardId !== boardId) return { error: "没有这个标签" };
  const { ok } = await boardGuard(label.boardId);
  if (!ok) return { error: "找不到这块板" };
  deleteLabel(labelId);
  revalidatePath(`/b/${boardId}`);
  return {};
}

/* ══ 小清单 ══ */

export async function addCheckItemAction(cardId: number, text: string) {
  const { card, ok } = await cardGuard(cardId);
  if (!ok || !card) return { error: "找不到这张卡" };
  if (!text.trim()) return { error: "写点什么" };
  addCheckItem(cardId, text.trim());
  revalidatePath(`/c/${cardId}`);
  revalidatePath(`/b/${card.boardId}`);
  return {};
}

export async function toggleCheckItemAction(cardId: number, itemId: number, done: boolean) {
  const { card, ok } = await cardGuard(cardId);
  if (!ok || !card) return { error: "找不到这张卡" };
  // itemId 要核对到卡：不核对的话，拿自己的卡当通行证就能改任何卡的清单
  if (checkItemCardId(itemId) !== cardId) return { error: "找不到这一条" };
  toggleCheckItem(itemId, done);
  revalidatePath(`/c/${cardId}`);
  revalidatePath(`/b/${card.boardId}`);
  return {};
}

export async function deleteCheckItemAction(cardId: number, itemId: number) {
  const { card, ok } = await cardGuard(cardId);
  if (!ok || !card) return { error: "找不到这张卡" };
  if (checkItemCardId(itemId) !== cardId) return { error: "找不到这一条" };
  deleteCheckItem(itemId);
  revalidatePath(`/c/${cardId}`);
  revalidatePath(`/b/${card.boardId}`);
  return {};
}

/* ══ 评论 ══ */

export async function addCommentAction(cardId: number, text: string) {
  const { user, card, ok } = await cardGuard(cardId);
  if (!ok || !card) return { error: "找不到这张卡" };
  const t = text.trim();
  if (!t) return { error: "写点什么" };
  addComment(cardId, user.id, t);

  // 推给「这事跟他有关」的人：负责人和建卡的人，不推给自己
  const targets = [...new Set([card.assigneeId, card.createdBy])].filter(
    (id): id is string => !!id && id !== user.id
  );
  await pushTo(targets, {
    title: `${user.displayName} 说：`,
    body: `${card.title} — ${t.slice(0, 60)}`,
    url: `/c/${cardId}`,
    tag: `card-${cardId}`,
  });

  revalidatePath(`/c/${cardId}`);
  revalidatePath(`/b/${card.boardId}`);
  return {};
}

export async function deleteCommentAction(cardId: number, commentId: number) {
  const { user, card, ok } = await cardGuard(cardId);
  if (!ok || !card) return { error: "找不到这张卡" };
  const meta = getCommentMeta(commentId);
  if (!meta || meta.cardId !== cardId) return { error: "找不到这条评论" };
  // 说过的话只有自己（和管理员）能撤
  if (meta.userId !== user.id && !user.isAdmin) return { error: "只能删自己的留言" };
  deleteComment(commentId);
  revalidatePath(`/c/${cardId}`);
  return {};
}
