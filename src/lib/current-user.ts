import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "./auth";
import { canSeeBoard, getBoard, getUser } from "./queries";
import type { Board, User } from "./types";

export const SESSION_COOKIE = "sankyaku_agents_session";

/** 已登录用户；未登录返回 null */
export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const uid = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  // 查库而不是查静态表：邀请注册进来的人也要能登录
  return getUser(uid);
}

/** 页面 / Action 用：未登录跳 /login。写操作永远以此为准，不信任表单里传来的 uid。 */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");
  return user;
}

/**
 * 取一块看得见的板，看不见就当它不存在（跳首页，不是报 403）。
 * 私人板的存在本身也是私事——「你没权限看第 7 号板」这句话
 * 已经泄露了第 7 号板存在。
 */
export async function requireBoard(boardId: number): Promise<{ user: User; board: Board }> {
  const user = await requireUser();
  const board = getBoard(boardId);
  if (!board || !canSeeBoard(board, user.id)) redirect("/");
  return { user, board };
}
