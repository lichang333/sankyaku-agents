"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  archiveCardAction,
  deleteCardAction,
  moveCardAction,
  updateCardAction,
} from "@/app/actions";
import Avatar from "@/components/Avatar";
import { useOutsideClose } from "@/components/useOutsideClose";
import type { Card, List, User } from "@/lib/types";

/**
 * 卡片的几个开关：负责人、到期日、移动到哪一列、归档 / 删除。
 *
 * 「移动到」这个下拉不是拖拽的备胎，它是主路径的一半：
 * 跨三列挪一张卡，在手机上拖过去要横滚两屏，点两下就完事。
 * 拖拽负责「挪一格」，下拉负责「挪到那边去」。
 */
export default function CardControls({
  card,
  lists,
  users,
  canDelete,
}: {
  card: Card;
  lists: List[];
  users: User[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const assignRef = useRef<HTMLDivElement>(null);
  useOutsideClose(assignRef, () => setAssignOpen(false));

  const assignee = users.find((u) => u.id === card.assigneeId) ?? null;

  const [due, setDue] = useState(card.dueDate ?? "");
  useEffect(() => setDue(card.dueDate ?? ""), [card.dueDate]);
  const commitDue = () => {
    const v = due || null;
    if (v === card.dueDate) return;
    run(() => updateCardAction(card.id, { dueDate: v }));
  };

  const pickAssignee = (id: string | null) => {
    setAssignOpen(false);
    if (id === card.assigneeId) return;
    run(() => updateCardAction(card.id, { assigneeId: id }));
  };

  const run = (fn: () => Promise<{ error?: string } | void>) =>
    startTransition(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) setError(res.error);
    });

  const field =
    "w-full rounded-xl border-2 border-swan bg-[var(--card)] px-2.5 py-2 text-[13px] font-bold outline-none focus:border-beetle dark:border-[#37464f]";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="mb-1 block text-[11px] font-black text-hare">谁来做</span>
          {/*
           * 下拉，但不是原生 <select>——option 里放不了头像。
           * 自己画菜单，每一行才放得下「头像 + 显示名 + @用户名」。
           */}
          <div ref={assignRef} className="relative">
            <button
              disabled={pending}
              onClick={() => setAssignOpen((o) => !o)}
              className={`${field} flex items-center gap-2 text-left`}
            >
              {assignee ? (
                <>
                  <Avatar userId={assignee.id} />
                  <span className="truncate">{assignee.displayName}</span>
                  <span className="shrink-0 text-[10px] font-bold text-hare">@{assignee.id}</span>
                </>
              ) : (
                <span className="text-hare">没人认领</span>
              )}
              <span className="ml-auto shrink-0 text-hare">▾</span>
            </button>

            {assignOpen && (
              <div className="duo-card absolute inset-x-0 top-full z-40 mt-1 p-1.5 shadow-xl">
                <button
                  disabled={pending}
                  onClick={() => pickAssignee(null)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-bold hover:bg-polar disabled:opacity-50 dark:hover:bg-[#37464f]"
                >
                  <span className="h-6 w-6 shrink-0" />
                  <span className="text-hare">没人认领</span>
                  {!card.assigneeId && <span className="ml-auto text-beetle-dark dark:text-beetle">✓</span>}
                </button>
                {users.map((u) => (
                  <button
                    key={u.id}
                    disabled={pending}
                    onClick={() => pickAssignee(u.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-bold hover:bg-polar disabled:opacity-50 dark:hover:bg-[#37464f]"
                  >
                    <Avatar userId={u.id} />
                    <span className="truncate">{u.displayName}</span>
                    <span className="shrink-0 text-[10px] font-bold text-hare">@{u.id}</span>
                    {card.assigneeId === u.id && (
                      <span className="ml-auto text-beetle-dark dark:text-beetle">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-black text-hare">什么时候要</span>
          <div className="flex items-center gap-2">
            {/*
              * 本地态 + 失焦提交，不逐次 change 就发请求：
              * 键盘改年份时 Chrome 每敲一段就派发一次 change，值全是
              * 0002-08-31 这种半成品；边输入边禁用输入框还会把焦点弹出来。
              */}
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              onBlur={commitDue}
              onKeyDown={(e) => e.key === "Enter" && commitDue()}
              className={field}
            />
            {card.dueDate && (
              <button
                disabled={pending}
                onClick={() => {
                  setDue("");
                  run(() => updateCardAction(card.id, { dueDate: null }));
                }}
                className="shrink-0 text-xs font-bold text-hare"
              >
                清掉
              </button>
            )}
          </div>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-[11px] font-black text-hare">移动到</span>
        <select
          disabled={pending}
          value={card.listId}
          onChange={(e) => run(() => moveCardAction(card.id, Number(e.target.value), 0))}
          className={field}
        >
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.isDone ? " ✓" : ""}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-[11px] font-bold text-cardinal">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          disabled={pending}
          onClick={() => run(() => archiveCardAction(card.id, !card.archivedAt))}
          className="rounded-xl border-2 border-swan px-3 py-1.5 text-xs font-bold disabled:opacity-50 dark:border-[#37464f]"
        >
          {card.archivedAt ? "↩︎ 从归档取回" : "🗄 归档这张卡"}
        </button>

        {canDelete &&
          (confirmDelete ? (
            <span className="flex items-center gap-2">
              <button
                disabled={pending}
                onClick={() => run(() => deleteCardAction(card.id))}
                className="rounded-xl bg-cardinal px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                真删，连评论和履历一起
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs font-bold text-hare"
              >
                算了
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-xl px-3 py-1.5 text-xs font-bold text-cardinal"
            >
              删除
            </button>
          ))}
      </div>
      <p className="text-[11px] font-bold text-hare">
        默认用归档：卡还在，履历也在。真删是不可撤销的。
      </p>
    </div>
  );
}
