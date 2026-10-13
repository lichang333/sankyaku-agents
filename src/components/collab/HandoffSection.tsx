"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createHandoffAction } from "@/app/actions-collab";
import { relTime } from "@/lib/dates";
import type { AgentPublic, HandoffPublic } from "@/lib/collaboration";
import type { CardOption } from "./MessageComposer";

export default function HandoffSection({
  channelId,
  handoffs,
  grantedAgents,
  cardTitles,
  availableCards,
}: {
  channelId: number;
  handoffs: HandoffPublic[];
  grantedAgents: AgentPublic[];
  cardTitles: Record<number, string>;
  availableCards: CardOption[];
}) {
  const [isOpenForm, setIsOpenForm] = useState(false);
  const [toAgentId, setToAgentId] = useState<string>(
    grantedAgents.length > 0 ? grantedAgents[0].id : "",
  );
  const [brief, setBrief] = useState("");
  const [cardId, setCardId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedAgentId = grantedAgents.some((a) => a.id === toAgentId)
    ? toAgentId : grantedAgents[0]?.id ?? "";
  const agentMap = new Map(grantedAgents.map((a) => [a.id, a]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedBrief = brief.trim();
    if (!selectedAgentId) {
      setError("请选择接收交接的 Agent");
      return;
    }
    if (!trimmedBrief) {
      setError("请输入交接任务说明");
      return;
    }
    if (trimmedBrief.length > 2000) {
      setError("交接说明不能超过 2,000 个字符");
      return;
    }

    startTransition(async () => {
      const res = await createHandoffAction(channelId, {
        toAgentId: selectedAgentId,
        brief: trimmedBrief,
        cardId: typeof cardId === "number" ? cardId : null,
      });

      if (res.error) {
        setError(res.error);
        return;
      }

      setBrief("");
      setCardId("");
      setIsOpenForm(false);
    });
  };

  return (
    <div className="duo-card p-3.5 sm:p-4">
      <div className="flex items-center justify-between border-b-2 border-swan pb-2.5 dark:border-[#37464f]">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-black">任务交接</span>
          <span className="rounded-md bg-[var(--track)] px-1.5 py-0.5 text-[10px] font-black text-mid">
            {handoffs.length}
          </span>
        </div>
        {!isOpenForm && grantedAgents.length > 0 && (
          <button
            type="button"
            onClick={() => setIsOpenForm(true)}
            className="text-xs font-bold text-beetle-dark hover:underline dark:text-beetle"
          >
            ＋ 发起交接
          </button>
        )}
      </div>

      <p className="mt-1.5 text-[11px] font-bold text-hare">
        将任务交由外部 Agent 处理。
        <span className="text-mid">完成仅代表 Agent 返回了结果，不代表自动代码合并或人工审核。</span>
      </p>

      {/* 创建交接表单 */}
      {isOpenForm && (
        <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-xl border-2 border-swan bg-[var(--track)] p-3 dark:border-[#37464f]">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black">发起新交接</h4>
            <button
              type="button"
              onClick={() => {
                setIsOpenForm(false);
                setError(null);
              }}
              className="text-xs font-bold text-hare hover:text-mid"
            >
              取消
            </button>
          </div>

          {error && (
            <div className="rounded-lg border-2 border-cardinal/30 bg-cardinal/10 p-2 text-xs font-bold text-cardinal">
              {error}
            </div>
          )}

          {/* 接收 Agent */}
          <div>
            <label htmlFor="target-agent" className="block text-[11px] font-bold text-mid">
              接收 Agent <span className="text-cardinal">*</span>
            </label>
            <select
              id="target-agent"
              value={selectedAgentId}
              onChange={(e) => setToAgentId(e.target.value)}
              className="mt-1 w-full rounded-lg border-2 border-swan bg-[var(--card)] px-2 py-1.5 text-xs font-bold outline-none focus:border-beetle dark:border-[#37464f]"
            >
              {grantedAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName} ({a.provider})
                </option>
              ))}
            </select>
          </div>

          {/* 交接任务描述 */}
          <div>
            <label htmlFor="handoff-brief" className="block text-[11px] font-bold text-mid">
              任务说明 <span className="text-cardinal">*</span>
            </label>
            <textarea
              id="handoff-brief"
              rows={2}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="说明需要 Agent 分析、处理或排查的具体内容..."
              maxLength={2000}
              className="mt-1 w-full rounded-lg border-2 border-swan bg-[var(--card)] px-2.5 py-1.5 text-xs font-bold outline-none focus:border-beetle dark:border-[#37464f]"
            />
          </div>

          {/* 关联任务卡片 */}
          {availableCards.length > 0 && (
            <div>
              <label htmlFor="handoff-card" className="block text-[11px] font-bold text-mid">
                关联任务卡片（可选）
              </label>
              <select
                id="handoff-card"
                value={cardId}
                onChange={(e) => setCardId(e.target.value === "" ? "" : Number(e.target.value))}
                className="mt-1 w-full truncate rounded-lg border-2 border-swan bg-[var(--card)] px-2 py-1.5 text-xs font-bold outline-none focus:border-beetle dark:border-[#37464f]"
              >
                <option value="">不关联卡片</option>
                {availableCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.id} {c.title} ({c.boardName})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setIsOpenForm(false);
                setError(null);
              }}
              className="rounded-lg px-2.5 py-1 text-xs font-bold text-hare hover:text-mid"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isPending || !brief.trim() || !selectedAgentId}
              className="btn3d bg-beetle px-3.5 py-1 text-xs text-white [--sh:var(--color-beetle-dark)]"
            >
              {isPending ? "提交中..." : "提交交接"}
            </button>
          </div>
        </form>
      )}

      {/* 无可用 Agent 提示 */}
      {grantedAgents.length === 0 && (
        <div className="mt-3 rounded-xl border-2 border-swan bg-[var(--track)] p-2.5 text-[11px] font-bold text-hare dark:border-[#37464f]">
          当前频道尚未授权任何 Agent 成员。你可在下方授权自己的 Agent 参与任务交接。
        </div>
      )}

      {/* 交接列表 */}
      <div className="mt-3 space-y-2.5">
        {handoffs.length === 0 ? (
          <p className="py-2 text-center text-xs font-bold text-hare">当前暂无交接记录</p>
        ) : (
          handoffs.map((h) => {
            const targetAgent = agentMap.get(h.toAgentId);
            const agentName = targetAgent ? targetAgent.displayName : `Agent ${h.toAgentId.slice(0, 8)}`;

            let stateBadge = (
              <span className="rounded bg-bee/20 px-1.5 py-0.5 text-[10px] font-black text-bee-dark dark:text-bee">
                ⏳ 等待接收
              </span>
            );
            if (h.state === "accepted") {
              stateBadge = (
                <span className="rounded bg-macaw/20 px-1.5 py-0.5 text-[10px] font-black text-macaw-dark dark:text-macaw">
                  🔄 进行中
                </span>
              );
            } else if (h.state === "completed") {
              stateBadge = (
                <span className="rounded bg-feather/20 px-1.5 py-0.5 text-[10px] font-black text-feather-dark dark:text-feather">
                  ✅ 已返回结果
                </span>
              );
            } else if (h.state === "declined") {
              stateBadge = (
                <span className="rounded bg-cardinal/20 px-1.5 py-0.5 text-[10px] font-black text-cardinal">
                  ❌ 已婉拒
                </span>
              );
            }

            return (
              <div
                key={h.id}
                className="rounded-xl border-2 border-swan bg-[var(--card)] p-3 text-xs dark:border-[#37464f]"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-extrabold text-mid">#{h.id} → {agentName}</span>
                  {stateBadge}
                </div>

                <p className="mt-1.5 whitespace-pre-wrap [overflow-wrap:anywhere] font-bold text-[var(--text)]">
                  {h.brief}
                </p>

                {/* 关联任务卡片 */}
                {h.cardId && cardTitles[h.cardId] && (
                  <div className="mt-2">
                    <Link
                      href={`/c/${h.cardId}`}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-beetle-dark hover:underline dark:text-beetle"
                    >
                      <span>📎 关联卡片 #{h.cardId}</span>
                      {cardTitles[h.cardId] && (
                        <span className="max-w-[180px] truncate text-mid">: {cardTitles[h.cardId]}</span>
                      )}
                    </Link>
                  </div>
                )}

                {/* 返回结果 */}
                {h.result && (
                  <div className="mt-2 rounded-lg border-2 border-feather/30 bg-feather/10 p-2 text-[11px] font-bold text-feather-dark dark:text-feather">
                    <div className="text-[10px] font-black">Agent 返回结果：</div>
                    <div className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-[var(--text)]">
                      {h.result}
                    </div>
                  </div>
                )}

                <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-hare">
                  <span>发起自: {h.senderKind === "human" ? "人类" : "Agent"}</span>
                  <span title={h.createdAt}>{relTime(h.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
